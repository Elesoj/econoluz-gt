import "server-only";

import { neon } from "@neondatabase/serverless";
import type { Ejecutor } from "./consulta";

/**
 * Las conexiones se crean de forma perezosa, nunca al importar el módulo: sin
 * `DATABASE_URL` en local el sitio tiene que arrancar igual, como ya hacían el
 * catálogo y `/api/leads`.
 *
 * Hay dos cadenas y no una. `DATABASE_URL` es la de la aplicación y puede
 * escribir. `DATABASE_URL_PUBLIC` es la del rol de lectura pública, restringido
 * a la proyección `public_products` que se creará en una tarea posterior.
 */

const desdeCadena = (cadena: string): Ejecutor => {
  const sql = neon(cadena);
  return (texto, parametros = []) =>
    sql.query(texto, [...parametros]) as Promise<Record<string, unknown>[]>;
};

export function ejecutorDeLectura(): Ejecutor {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) {
    throw new Error("Falta DATABASE_URL.");
  }
  return desdeCadena(cadena);
}

export function hayConexionPublica() {
  return Boolean(process.env.DATABASE_URL_PUBLIC);
}

export function ejecutorPublico(): Ejecutor | null {
  const cadena = process.env.DATABASE_URL_PUBLIC;
  return cadena ? desdeCadena(cadena) : null;
}
