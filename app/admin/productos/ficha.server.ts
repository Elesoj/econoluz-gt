import "server-only";

import { neon } from "@neondatabase/serverless";
import {
  guardarFichaProducto,
  leerProductoPorReferencia,
  type CambioFicha,
  type ProductoFicha,
} from "./ficha";

/**
 * Solo la conexión. Todo lo demás vive en `ficha.ts`, que es puro: así se
 * puede probar sin base de datos y lo pueden usar los scripts de terminal,
 * que no saben resolver "server-only".
 */
function conectar() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const sql = neon(connectionString);
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>;
}

export async function getProductoFicha(referencia: string): Promise<ProductoFicha | null> {
  return leerProductoPorReferencia(conectar(), referencia);
}

export async function saveProductoFicha(cambio: CambioFicha): Promise<void> {
  return guardarFichaProducto(conectar(), cambio);
}
