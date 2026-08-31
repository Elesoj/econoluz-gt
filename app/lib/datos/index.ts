import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { ejecutorDeLectura, ejecutorPublico } from "./conexion";
import { consultar, type Ejecutor } from "./consulta";
import { ErrorDeDatos } from "./errores";
import { nuevoIdPeticion, registrar } from "./registro";
import { enTransaccion, type PoolMinimo } from "./transaccion";

export { ErrorDeDatos, type CausaDeError } from "./errores";
export { nuevoIdPeticion, registrar } from "./registro";
export type { Ejecutor } from "./consulta";
export { hayConexionPublica } from "./conexion";

// El controlador habla por WebSocket. Node 22 en adelante trae uno nativo, así
// que no hace falta ninguna dependencia extra, igual que en scripts/migrate.mjs.
neonConfig.webSocketConstructor = globalThis.WebSocket;

let pool: PoolMinimo | null = null;

/** El pool se crea una vez y se conserva: reutilizar conexiones es su función. */
function obtenerPool(): PoolMinimo {
  if (!pool) {
    const cadena = process.env.DATABASE_URL;
    if (!cadena) {
      throw new Error("Falta DATABASE_URL.");
    }
    pool = new Pool({ connectionString: cadena }) as unknown as PoolMinimo;
  }
  return pool;
}

/** Lectura con la conexión de la aplicación. */
export function leer<T>(
  texto: string,
  parametros: readonly unknown[] = [],
  opciones?: { msMaximo?: number },
) {
  return consultar<T>(ejecutorDeLectura(), texto, parametros, opciones);
}

/**
 * Lectura con el rol público. Devuelve `null` cuando no hay cadena pública
 * configurada: quien llama decide qué hacer, y en producción la decisión es
 * usar el respaldo estático, nunca la conexión privilegiada.
 */
export function leerPublico<T>(
  texto: string,
  parametros: readonly unknown[] = [],
  opciones?: { msMaximo?: number },
): Promise<T[]> | null {
  const ejecutor: Ejecutor | null = ejecutorPublico();
  return ejecutor ? consultar<T>(ejecutor, texto, parametros, opciones) : null;
}

/**
 * Escritura dentro de transacción. Exige `runtime = "nodejs"` en quien la use.
 *
 * Es el único punto de la capa que registra: una lectura fallida ya la maneja
 * quien la pidió, pero una escritura que se deshace es un suceso que hay que
 * poder encontrar después en el log por su `idPeticion`.
 */
export async function escribir<T>(
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones?: { msMaximo?: number },
): Promise<T> {
  const idPeticion = nuevoIdPeticion();
  const comienzo = Date.now();

  try {
    const resultado = await enTransaccion(obtenerPool(), trabajo, opciones);
    registrar("info", "transaccion", { idPeticion, ms: Date.now() - comienzo });
    return resultado;
  } catch (error) {
    registrar("error", "transaccion", {
      idPeticion,
      ms: Date.now() - comienzo,
      // La causa, no el mensaje de Postgres: eso lleva nombres de tablas.
      causa: error instanceof ErrorDeDatos ? error.causa : "indisponible",
    });
    throw error;
  }
}
