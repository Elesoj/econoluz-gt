import "server-only";

import { unstable_cache } from "next/cache";
import { ErrorDeDatos, leer, registrar, type Ejecutor } from "./datos";
import { leerModeloDeCatalogo, MODELO_POR_DEFECTO, type ModeloDeCatalogo } from "./ajustes";

/**
 * Lectura de la bandera del modelo de catálogo contra Neon.
 *
 * Va por `leer` y no por la conexión cruda a propósito: `app/lib/datos/index.ts`
 * es la única superficie que consume el resto de `app/**`, y así esta consulta
 * hereda el tiempo máximo y los errores tipados de la capa. Sin ese límite, una
 * base colgada dejaría esperando a cada página que preguntase por la bandera.
 */

/**
 * Sesenta segundos de caché: lo bastante para no consultar en cada carga, y lo
 * bastante poco para que una vuelta atrás urgente se note casi enseguida. Es la
 * razón de que la bandera viva aquí y no en una variable de entorno, que
 * exigiría un despliegue.
 */
const SEGUNDOS_DE_CACHE = 60;

const ejecutor: Ejecutor = (texto, parametros) =>
  leer<Record<string, unknown>>(texto, parametros);

// Un fallo de lectura queda cacheado como `legacy` hasta un minuto, y no pasa
// nada: `legacy` es justamente el valor al que degrada la política. La caché
// solo puede retrasar una activación, nunca sostener una activación indebida.
const leerConCache = unstable_cache(
  async (): Promise<ModeloDeCatalogo> => leerModeloDeCatalogo(ejecutor),
  ["modelo-catalogo"],
  { revalidate: SEGUNDOS_DE_CACHE },
);

export async function obtenerModeloDeCatalogo(): Promise<ModeloDeCatalogo> {
  // Sin base configurada no hay nada que leer, y eso es normal en local: el
  // sitio arranca igual, como ya hacen el catálogo y `/api/leads`.
  if (!process.env.DATABASE_URL) {
    return MODELO_POR_DEFECTO;
  }

  try {
    return await leerConCache();
  } catch (error) {
    // `leerModeloDeCatalogo` ya se traga sus propios fallos, así que llegar
    // aquí significa que falló la caché o la propia capa. Se sirve el camino
    // probado, pero se deja constancia: un respaldo silencioso es un respaldo
    // que nadie arregla. Solo la causa, nunca el texto de Postgres.
    registrar("error", "ajustes-modelo-catalogo", {
      causa: error instanceof ErrorDeDatos ? error.causa : "desconocida",
    });
    return MODELO_POR_DEFECTO;
  }
}
