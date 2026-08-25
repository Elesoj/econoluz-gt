import "server-only";

import { neon } from "@neondatabase/serverless";
import { leerProductosAdmin, type FiltrosProductos, type ResultadoListado } from "./list";

function conectar() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const sql = neon(connectionString);
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>;
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
