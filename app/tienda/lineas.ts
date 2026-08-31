import type { PublicProduct } from "../data/publicProduct";
import type { LineaCarrito } from "./carrito";
import type { Disponibilidad } from "./disponibilidad";

/**
 * Empareja las líneas del carrito con el catálogo del servidor y suma.
 *
 * El dinero se maneja en centavos enteros de principio a fin. Sumar quetzales
 * en coma flotante acumula errores que acaban saliendo en pantalla como un
 * céntimo que no cuadra, y en una factura eso no se puede explicar.
 */

export type LineaResuelta = {
  producto: PublicProduct;
  cantidad: number;
  precioCentavos: number;
  subtotalCentavos: number;
  /** Se pidió más de lo apuntado en existencias. Avisa; no bloquea. */
  superaExistencias: boolean;
  /**
   * El cliente ya vio el aviso y dijo que prefiere esperar. Mientras sea
   * `false` y `superaExistencias` sea `true`, la línea está pendiente de que
   * decida: o se lleva lo disponible, o acepta el plazo.
   */
  esperaAceptada: boolean;
  /**
   * Unidades que hay apuntadas, cuando las hay. Es lo que se le ofrece al
   * cliente como alternativa: «llévate estas ahora».
   */
  disponiblesAhora?: number;
};

export type CarritoResuelto = {
  lineas: LineaResuelta[];
  /** Referencias que estaban guardadas y ya no se pueden comprar. */
  descartadas: string[];
  totalCentavos: number;
};

export const aCentavos = (quetzales: number) => Math.round(quetzales * 100);

export const aQuetzales = (centavos: number) => centavos / 100;

export const resolverCarrito = (
  lineas: readonly LineaCarrito[],
  catalogo: readonly PublicProduct[],
  /**
   * Lo que el servidor contestó sobre el inventario. Es opcional porque puede
   * no haber llegado todavía, o no haber podido consultarse: mientras falte,
   * el carrito funciona igual y no avisa de plazos que no puede comprobar.
   */
  disponibilidad?: Disponibilidad,
): CarritoResuelto => {
  const porReferencia = new Map(
    catalogo.map((producto) => [producto.econoluzReference, producto]),
  );

  const resueltas: LineaResuelta[] = [];
  const descartadas: string[] = [];
  let totalCentavos = 0;

  for (const linea of lineas) {
    const producto = porReferencia.get(linea.econoluzReference);

    // Sin producto o sin precio comprable no hay compra posible. Se descarta
    // esa línea y se sigue: una referencia caducada no puede tumbar el carrito
    // entero.
    //
    // «Comprable» es número finito y mayor que cero, la misma regla que aplica
    // `toPublicProduct` al salir al navegador. Se repite aquí a propósito: este
    // motor recibe un `PublicProduct` y no puede dar por hecho que siempre lo
    // haya construido esa frontera. Cero significaría regalar el producto, y un
    // `NaN` o un `Infinity` envenenarían el total del carrito entero.
    if (
      !producto ||
      typeof producto.priceGtq !== "number" ||
      !Number.isFinite(producto.priceGtq) ||
      producto.priceGtq <= 0
    ) {
      descartadas.push(linea.econoluzReference);
      continue;
    }

    const precioCentavos = aCentavos(producto.priceGtq);
    const subtotalCentavos = precioCentavos * linea.cantidad;
    // Mientras el servidor no diga lo contrario, se da por hecho que alcanza:
    // no saber nada del inventario no autoriza a frenar una compra.
    const respuesta = disponibilidad?.[linea.econoluzReference];
    const superaExistencias = respuesta?.alcanza === false;

    resueltas.push({
      producto,
      cantidad: linea.cantidad,
      precioCentavos,
      subtotalCentavos,
      superaExistencias,
      // La marca guardada solo cuenta mientras siga habiendo algo que esperar:
      // si el inventario se repuso, la línea vuelve a ser normal sin que nadie
      // tenga que limpiar nada.
      esperaAceptada: superaExistencias && linea.esperaAceptada === true,
      ...(superaExistencias && typeof respuesta?.disponiblesAhora === "number"
        ? { disponiblesAhora: respuesta.disponiblesAhora }
        : {}),
    });

    totalCentavos += subtotalCentavos;
  }

  return { lineas: resueltas, descartadas, totalCentavos };
};
