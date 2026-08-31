import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { ejecutorDeLectura, ejecutorPublico } from "./conexion";
import { consultar, type Ejecutor } from "./consulta";
import { escribirConPool } from "./escritura";
import type { PoolMinimo } from "./transaccion";

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
 * poder encontrar después en el log por su `idPeticion`. `suceso` permite
 * distinguir qué escritura falló en el log; por defecto es `"transaccion"`.
 *
 * La lógica vive en `escritura.ts`, un módulo puro que acepta el pool como
 * parámetro: así puede probarse con un pool de mentira sin arrastrar
 * `server-only` ni el driver de Neon. Aquí solo se conecta con el pool real.
 */
export function escribir<T>(
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones?: { msMaximoPorSentencia?: number; suceso?: string },
): Promise<T> {
  return escribirConPool(obtenerPool(), trabajo, opciones);
}
