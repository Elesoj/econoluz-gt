import type { Ejecutor } from "./consulta";
import { ErrorDeDatos } from "./errores";
import { nuevoIdPeticion, registrar } from "./registro";
import { enTransaccion, type PoolMinimo } from "./transaccion";

/**
 * Módulo puro: sin `server-only` y sin importar el driver de Neon. Es lo que
 * permite probar el contrato de `escribir` con un pool inyectado desde
 * `node:test`, sin depender de un `Pool` real ni de `DATABASE_URL`.
 * `app/lib/datos/index.ts` es quien lo conecta con el pool de verdad.
 */

/**
 * El código SQLSTATE del error original de Postgres, si lo hay —`"23505"`,
 * `"42501"`—. Es un escalar corto que no lleva nombres de tabla ni de
 * columna, así que registrarlo no viola la regla de no filtrar texto de
 * Postgres. Si no hay código, no se añade el campo.
 */
function codigoSqlDe(error: unknown): string | undefined {
  const causaOriginal = error instanceof ErrorDeDatos ? error.cause : undefined;
  if (
    typeof causaOriginal === "object" &&
    causaOriginal !== null &&
    "code" in causaOriginal &&
    typeof (causaOriginal as { code: unknown }).code === "string"
  ) {
    return (causaOriginal as { code: string }).code;
  }
  return undefined;
}

/**
 * Escritura dentro de transacción, con el pool que reciba. Exige
 * `runtime = "nodejs"` en quien la use.
 *
 * Es el único punto de la capa que registra: una lectura fallida ya la maneja
 * quien la pidió, pero una escritura que se deshace es un suceso que hay que
 * poder encontrar después en el log por su `idPeticion`. `suceso` permite
 * distinguir qué escritura falló en el log; por defecto es `"transaccion"`.
 */
export async function escribirConPool<T>(
  pool: PoolMinimo,
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones?: { msMaximoPorSentencia?: number; suceso?: string },
): Promise<T> {
  const suceso = opciones?.suceso ?? "transaccion";
  const idPeticion = nuevoIdPeticion();
  const comienzo = Date.now();

  try {
    const resultado = await enTransaccion(pool, trabajo, opciones);
    registrar("info", suceso, { idPeticion, ms: Date.now() - comienzo });
    return resultado;
  } catch (error) {
    const codigoSql = codigoSqlDe(error);
    registrar("error", suceso, {
      idPeticion,
      ms: Date.now() - comienzo,
      // La causa, no el mensaje de Postgres: eso lleva nombres de tablas.
      causa: error instanceof ErrorDeDatos ? error.causa : "indisponible",
      ...(codigoSql ? { codigoSql } : {}),
    });
    throw error;
  }
}
