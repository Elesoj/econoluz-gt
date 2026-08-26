import type { LineaCarrito } from "./carrito";

/**
 * Lo que el servidor contesta cuando se le pregunta si alcanza el inventario.
 *
 * Se pregunta línea a línea en vez de publicar las existencias en el catálogo
 * porque el número de unidades es información del negocio: puesto en el HTML,
 * cualquiera podría leer el inventario completo de los 313 productos sin
 * comprar nada. Aquí solo se revela lo justo, y solo del producto que esa
 * persona ya tiene en su carrito y en la cantidad que pidió.
 */
export type DisponibilidadLinea = {
  econoluzReference: string;
  /** El inventario apuntado cubre la cantidad pedida. */
  alcanza: boolean;
  /**
   * Unidades que hay ahora mismo. Solo viaja cuando **no** alcanza, que es
   * cuando el cliente necesita el dato para decidir si se lleva esas o espera.
   */
  disponiblesAhora?: number;
};

export type Disponibilidad = Record<string, DisponibilidadLinea>;

/**
 * Decide qué contestar sobre una línea, sin tocar la base de datos.
 *
 * Vive separado de la consulta para poder comprobarlo sin Postgres delante.
 * `existencias` es lo apuntado en el panel: `null` significa «no se ha contado
 * el inventario», que no es lo mismo que cero y no autoriza a prometer plazos.
 */
export const decidirDisponibilidad = (
  linea: LineaCarrito,
  existencias: number | null,
): DisponibilidadLinea => {
  if (existencias === null || !Number.isSafeInteger(existencias)) {
    return { econoluzReference: linea.econoluzReference, alcanza: true };
  }

  if (linea.cantidad <= existencias) {
    return { econoluzReference: linea.econoluzReference, alcanza: true };
  }

  return {
    econoluzReference: linea.econoluzReference,
    alcanza: false,
    disponiblesAhora: Math.max(existencias, 0),
  };
};
