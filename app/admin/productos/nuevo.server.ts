import "server-only";

import { neon } from "@neondatabase/serverless";
import { crearProducto, type ProductoNuevo } from "./nuevo";

function conectar() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  const sql = neon(connectionString);
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>;
}

export async function crearProductoEnCatalogo(datos: ProductoNuevo): Promise<string> {
  return crearProducto(conectar(), datos);
}
