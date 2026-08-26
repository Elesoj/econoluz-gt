/**
 * El carrito de la tienda.
 *
 * Guarda referencias y cantidades, nunca precios: el precio se resuelve contra
 * el catálogo del servidor cada vez que se pinta o se cobra. Si el importe
 * viajara en el navegador, cualquiera podría editar su propio carrito y
 * comprar un panel por un quetzal.
 *
 * Es gemelo del motor de cotización (`app/catalogo/quoteSelection.ts`) y a
 * propósito no lo reutiliza: la cotización no sabe de dinero ni de existencias
 * y no debe cargar con ello.
 */

export type LineaCarrito = {
  econoluzReference: string;
  cantidad: number;
};

export type AccionCarrito =
  | { tipo: "agregar"; econoluzReference: string; cantidad?: number }
  | { tipo: "quitar"; econoluzReference: string }
  | { tipo: "fijar"; econoluzReference: string; cantidad: number }
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

  return lineas.map((linea, posicion) =>
    posicion === indice ? { ...linea, cantidad: cantidadPedida } : linea,
  );
};
