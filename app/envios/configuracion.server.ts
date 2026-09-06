import "server-only";

import { unstable_cache, updateTag } from "next/cache";
import { ErrorDeDatos, escribir, leer, registrar } from "../lib/datos";
import {
  CLAVE_AJUSTE_REGLAS_PROPIAS,
  CLAVE_AJUSTE_ZONAS_METODOS,
  fusionarMetodoZona,
  interpretarReglasPropias,
  interpretarZonasMetodos,
} from "./configuracion";
import {
  mapaMetodosPorDefecto,
  type MetodoEnvioZona,
  type ZonaCapitalina,
} from "./zonasCapitalinas";
import { REGLAS_PROPIAS_DEFECTO, type ReglasPropias } from "./tarifas";

export const TAG_CACHE_ENVIOS_CONFIG = "envios-configuracion";

/**
 * Sesenta segundos, el mismo criterio que `app/lib/ajustes.server.ts`: bastante
 * para no consultar en cada carga, poco para que un cambio del panel se note casi
 * enseguida aunque falle la invalidación por etiqueta.
 */
const SEGUNDOS_DE_CACHE = 60;

const leerZonasConCache = unstable_cache(
  async (): Promise<Record<ZonaCapitalina, MetodoEnvioZona>> => {
    const filas = await leer<{ valor: string }>(
      "select valor from app_settings where clave = $1",
      [CLAVE_AJUSTE_ZONAS_METODOS],
    );
    return interpretarZonasMetodos(filas[0]?.valor);
  },
  ["ajuste-zonas-metodos"],
  { tags: [TAG_CACHE_ENVIOS_CONFIG], revalidate: SEGUNDOS_DE_CACHE },
);

const leerReglasConCache = unstable_cache(
  async (): Promise<ReglasPropias> => {
    const filas = await leer<{ valor: string }>(
      "select valor from app_settings where clave = $1",
      [CLAVE_AJUSTE_REGLAS_PROPIAS],
    );
    return interpretarReglasPropias(filas[0]?.valor);
  },
  ["ajuste-reglas-propias"],
  { tags: [TAG_CACHE_ENVIOS_CONFIG], revalidate: SEGUNDOS_DE_CACHE },
);

/**
 * Sin base configurada no hay nada que leer, y eso es normal en local. Un fallo
 * de lectura tampoco puede tumbar la página: se sirve la configuración comercial
 * aprobada y queda constancia, porque un respaldo silencioso no lo arregla nadie.
 */
export async function obtenerMetodosZonas(): Promise<
  Record<ZonaCapitalina, MetodoEnvioZona>
> {
  if (!process.env.DATABASE_URL) {
    return mapaMetodosPorDefecto();
  }
  try {
    return await leerZonasConCache();
  } catch (error) {
    registrar("error", "envios-metodos-zonas", {
      causa: error instanceof ErrorDeDatos ? error.causa : "desconocida",
    });
    return mapaMetodosPorDefecto();
  }
}

export async function obtenerReglasPropias(): Promise<ReglasPropias> {
  if (!process.env.DATABASE_URL) {
    return { ...REGLAS_PROPIAS_DEFECTO };
  }
  try {
    return await leerReglasConCache();
  } catch (error) {
    registrar("error", "envios-reglas-propias", {
      causa: error instanceof ErrorDeDatos ? error.causa : "desconocida",
    });
    return { ...REGLAS_PROPIAS_DEFECTO };
  }
}

/** Invalida la caché sin dejar que su fallo deshaga una escritura ya confirmada. */
function invalidarCache(): void {
  try {
    updateTag(TAG_CACHE_ENVIOS_CONFIG);
  } catch (error) {
    registrar("error", "cache-envios-configuracion-no-invalidada", {
      clase: error instanceof Error ? error.constructor.name : "desconocida",
    });
  }
}

/**
 * Cambia el método de una zona. La fila se bloquea con `for update` antes de
 * leerla, de modo que dos administradores que cambien zonas distintas a la vez no
 * se pisen el mapa: el segundo lee lo que dejó el primero.
 */
export async function guardarMetodoZona(
  zona: ZonaCapitalina,
  metodo: MetodoEnvioZona,
  actorId: string,
): Promise<void> {
  await escribir(
    async (ejecutar) => {
      const filas = (await ejecutar(
        "select valor from app_settings where clave = $1 for update",
        [CLAVE_AJUSTE_ZONAS_METODOS],
      )) as { valor: string }[];

      const mapaVigente = interpretarZonasMetodos(filas[0]?.valor);
      const { valorSerializado, metodoAnterior } = fusionarMetodoZona(mapaVigente, zona, metodo);

      await ejecutar(
        `insert into app_settings (clave, valor, actualizado_en, actualizado_por)
         values ($1, $2, now(), $3)
         on conflict (clave) do update
           set valor = excluded.valor,
               actualizado_en = now(),
               actualizado_por = excluded.actualizado_por`,
        [CLAVE_AJUSTE_ZONAS_METODOS, valorSerializado, actorId],
      );

      await ejecutar(
        `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
         values ('admin', $1, 'cambiar_metodo_zona', 'app_setting', $2, $3::jsonb, $4::jsonb)`,
        [
          actorId,
          CLAVE_AJUSTE_ZONAS_METODOS,
          JSON.stringify({ zona, metodo: metodoAnterior }),
          JSON.stringify({ zona, metodo }),
        ],
      );
    },
    { suceso: "guardar-metodo-zona" },
  );

  invalidarCache();
}

/** Cambia la tarifa y el umbral de gratuidad del mensajero propio. */
export async function guardarReglasPropias(
  reglas: ReglasPropias,
  actorId: string,
): Promise<void> {
  const normalizadas = interpretarReglasPropias(reglas);
  const valorSerializado = JSON.stringify(normalizadas);

  await escribir(
    async (ejecutar) => {
      const filas = (await ejecutar(
        "select valor from app_settings where clave = $1 for update",
        [CLAVE_AJUSTE_REGLAS_PROPIAS],
      )) as { valor: string }[];

      const anteriores = interpretarReglasPropias(filas[0]?.valor);

      await ejecutar(
        `insert into app_settings (clave, valor, actualizado_en, actualizado_por)
         values ($1, $2, now(), $3)
         on conflict (clave) do update
           set valor = excluded.valor,
               actualizado_en = now(),
               actualizado_por = excluded.actualizado_por`,
        [CLAVE_AJUSTE_REGLAS_PROPIAS, valorSerializado, actorId],
      );

      await ejecutar(
        `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
         values ('admin', $1, 'guardar_reglas_envio', 'app_setting', $2, $3::jsonb, $4::jsonb)`,
        [
          actorId,
          CLAVE_AJUSTE_REGLAS_PROPIAS,
          JSON.stringify(anteriores),
          valorSerializado,
        ],
      );
    },
    { suceso: "guardar-reglas-propias" },
  );

  invalidarCache();
}
