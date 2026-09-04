import "server-only";

import { unstable_cache, updateTag } from "next/cache";
import { ErrorDeDatos, escribir, leer, registrar, type Ejecutor } from "./datos";
import {
  CLAVE_RECOGIDA_TIENDA,
  leerAjusteRecogidaEnTienda,
  leerModeloDeCatalogo,
  leerRecogidaEnTienda,
  MODELO_POR_DEFECTO,
  RECOGIDA_POR_DEFECTO,
  type ModeloDeCatalogo,
  type RecogidaEnTienda,
} from "./ajustes";

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

const leerRecogidaConCache = unstable_cache(
  async (): Promise<RecogidaEnTienda> => leerAjusteRecogidaEnTienda(ejecutor),

  ["recogida-en-tienda"],
  { tags: ["envios-tarifas"], revalidate: SEGUNDOS_DE_CACHE },
);

export async function obtenerRecogidaEnTienda(): Promise<RecogidaEnTienda> {
  if (!process.env.DATABASE_URL) {
    return { ...RECOGIDA_POR_DEFECTO };
  }

  try {
    return await leerRecogidaConCache();
  } catch (error) {
    registrar("error", "ajustes-recogida-tienda", {
      causa: error instanceof ErrorDeDatos ? error.causa : "desconocida",
    });
    return { ...RECOGIDA_POR_DEFECTO };
  }
}

export async function guardarRecogidaEnTienda(
  config: RecogidaEnTienda,
  actorId: string,
): Promise<void> {
  const normalizada = leerRecogidaEnTienda(config);
  const valorJson = JSON.stringify(normalizada);

  await escribir(
    async (ejecutar) => {
      const anteriores = (await ejecutar(
        "select valor from app_settings where clave = $1 for update",
        [CLAVE_RECOGIDA_TIENDA],
      )) as { valor: string }[];

      const anterior = anteriores[0] ? leerRecogidaEnTienda(anteriores[0].valor) : null;

      await ejecutar(
        `insert into app_settings (clave, valor, actualizado_en, actualizado_por)
         values ($1, $2, now(), $3)
         on conflict (clave) do update
           set valor = excluded.valor,
               actualizado_en = now(),
               actualizado_por = excluded.actualizado_por`,
        [CLAVE_RECOGIDA_TIENDA, valorJson, actorId],
      );

      await ejecutar(
        `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
         values ('admin', $1, 'configurar_recogida', 'app_setting', $2, $3::jsonb, $4::jsonb)`,
        [
          actorId,
          CLAVE_RECOGIDA_TIENDA,
          anterior ? JSON.stringify(anterior) : null,
          valorJson,
        ],
      );
    },
    { suceso: "guardar-recogida-tienda" },
  );

  try {
    updateTag("envios-tarifas");
  } catch (error) {
    registrar("error", "cache-envios-no-invalidada", {
      clase: error instanceof Error ? error.constructor.name : "desconocida",
    });
  }
}

