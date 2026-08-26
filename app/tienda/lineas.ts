import type { PublicProduct } from "../data/publicProduct";
import type { LineaCarrito } from "./carrito";

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
): CarritoResuelto => {
  const porReferencia = new Map(
    catalogo.map((producto) => [producto.econoluzReference, producto]),
  );

  const resueltas: LineaResuelta[] = [];
  const descartadas: string[] = [];
  let totalCentavos = 0;

  for (const linea of lineas) {
    const producto = porReferencia.get(linea.econoluzReference);

    // Sin producto o sin precio no hay compra posible. Se descarta esa línea
    // y se sigue: una referencia caducada no puede tumbar el carrito entero.
    if (!producto || typeof producto.priceGtq !== "number") {
      descartadas.push(linea.econoluzReference);
      continue;
    }

    const precioCentavos = aCentavos(producto.priceGtq);
    const subtotalCentavos = precioCentavos * linea.cantidad;

    resueltas.push({
      producto,
      cantidad: linea.cantidad,
      precioCentavos,
      subtotalCentavos,
      // Existencias sin apuntar significa «no sé cuántos hay», no «no hay
      // ninguno»: en ese caso no se avisa de un plazo que nadie ha calculado.
      superaExistencias:
        typeof producto.stock === "number" && linea.cantidad > producto.stock,
    });

    totalCentavos += subtotalCentavos;
  }

  return { lineas: resueltas, descartadas, totalCentavos };
};
