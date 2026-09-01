import "server-only";

import { leer } from "../../lib/datos";
import { leerProductosAdmin, type FiltrosProductos, type ResultadoListado } from "./list";

/**
 * Solo la conexión, ahora por la capa de datos. La comprobación de
 * `DATABASE_URL` se conserva para que el error siga saliendo aquí y no en la
 * primera consulta.
 *
 * Va por `leer` incluso para el `update` de abajo: es una sola sentencia, que
 * en Postgres ya es atómica, así que el camino no cambia respecto a antes del
 * traslado.
 */
function conectar() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL.");
  }

  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
}

export async function getProductosAdmin(filtros: FiltrosProductos): Promise<ResultadoListado> {
  return leerProductosAdmin(conectar(), filtros);
}

export type CambioProducto = {
  referencia: string;
  precio: number | null;
  existencias: number | null;
  publicado: boolean;
};

/**
 * Guarda los cambios de una fila. Se actualiza solo lo que administra la
 * persona: `CLAUDE.md` y el importador respetan estas cuatro columnas, y el
 * resto del producto se edita en su ficha, no aquí.
 */
export async function guardarCambiosProducto(cambio: CambioProducto): Promise<void> {
  const query = conectar();
  await query(
    `
      update products
      set price_gtq = $1,
          stock = $2,
          published = $3
      where econoluz_reference = $4
    `,
    [cambio.precio, cambio.existencias, cambio.publicado, cambio.referencia],
  );
}
