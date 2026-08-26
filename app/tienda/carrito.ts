/**
 * El carrito de la tienda.
 *
 * Guarda referencias y cantidades, nunca precios: el precio se resuelve contra
 * el catálogo del servidor cada vez que se pinta o se cobra. Si el importe
 * viajara en el navegador, cualquiera podría editar su propio carrito y
 * comprar un panel por un quetzal.
 *
 * Nació como gemelo del motor de cotización del catálogo, que se retiró el
 * 26/08/2026 cuando el catálogo pasó a ser solo tienda. Se mantuvo separado a
 * propósito y por eso aquella retirada no le afectó.
 */

export type LineaCarrito = {
  econoluzReference: string;
  cantidad: number;
  /**
   * El cliente pidió más unidades de las que hay apuntadas y aceptó esperar.
   *
   * Solo se guarda el sí: cuando prefiere llevarse lo disponible, lo que hace
   * es bajar la cantidad, y entonces no hay nada que esperar ni que recordar.
   * La marca se pierde en cuanto cambia la cantidad, porque quien aceptó
   * esperar diez unidades no ha aceptado esperar cuarenta.
   */
  esperaAceptada?: true;
};

export type AccionCarrito =
  | { tipo: "agregar"; econoluzReference: string; cantidad?: number }
  | { tipo: "quitar"; econoluzReference: string }
  | { tipo: "fijar"; econoluzReference: string; cantidad: number }
  | { tipo: "aceptarEspera"; econoluzReference: string }
  | { tipo: "vaciar" };

/**
 * Tope por línea. No es una regla de negocio: es un freno para que un `<input>`
 * manipulado no genere un pedido de un millón de unidades. Quien necesite más
 * de novecientas noventa y nueve piezas está haciendo un proyecto, y para eso
 * está la asesoría.
 */
export const CANTIDAD_MAXIMA_POR_LINEA = 999;

const esCantidadValida = (cantidad: number) =>
  Number.isSafeInteger(cantidad) &&
  cantidad >= 1 &&
  cantidad <= CANTIDAD_MAXIMA_POR_LINEA;

const esReferenciaValida = (referencia: unknown): referencia is string =>
  typeof referencia === "string" && referencia.length > 0;

export const contarArticulos = (lineas: readonly LineaCarrito[]) =>
  lineas.reduce((total, linea) => total + linea.cantidad, 0);

export const reducirCarrito = (
  lineas: readonly LineaCarrito[],
  accion: AccionCarrito,
): LineaCarrito[] => {
  if (accion.tipo === "vaciar") {
    return lineas.length === 0 ? (lineas as LineaCarrito[]) : [];
  }

  if (!esReferenciaValida(accion.econoluzReference)) {
    return lineas as LineaCarrito[];
  }

  const indice = lineas.findIndex(
    (linea) => linea.econoluzReference === accion.econoluzReference,
  );

  if (accion.tipo === "quitar") {
    return indice < 0
      ? (lineas as LineaCarrito[])
      : lineas.filter((_, posicion) => posicion !== indice);
  }

  if (accion.tipo === "aceptarEspera") {
    if (indice < 0 || lineas[indice].esperaAceptada) {
      return lineas as LineaCarrito[];
    }

    return lineas.map((linea, posicion) =>
      posicion === indice ? { ...linea, esperaAceptada: true as const } : linea,
    );
  }

  const cantidadPedida =
    accion.tipo === "agregar"
      ? (accion.cantidad ?? 1) + (indice < 0 ? 0 : lineas[indice].cantidad)
      : accion.cantidad;

  // Fijar a cero es la forma de borrar desde el selector de cantidad.
  if (accion.tipo === "fijar" && cantidadPedida === 0) {
    return indice < 0
      ? (lineas as LineaCarrito[])
      : lineas.filter((_, posicion) => posicion !== indice);
  }

  if (!esCantidadValida(cantidadPedida)) {
    return lineas as LineaCarrito[];
  }

  if (indice < 0) {
    return [
      ...lineas,
      { econoluzReference: accion.econoluzReference, cantidad: cantidadPedida },
    ];
  }

  if (lineas[indice].cantidad === cantidadPedida) {
    return lineas as LineaCarrito[];
  }

  // Se reconstruye la línea en vez de copiarla: cambiar la cantidad tiene que
  // olvidar la espera aceptada, que se dio para otra cantidad distinta.
  return lineas.map((linea, posicion) =>
    posicion === indice
      ? { econoluzReference: linea.econoluzReference, cantidad: cantidadPedida }
      : linea,
  );
};
