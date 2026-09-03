import "server-only";

import { unstable_cache } from "next/cache";
import { leerPublico, type Ejecutor } from "../../lib/datos";
import type { PublicProduct } from "../publicProduct";
import {
  crearLectorCatalogoPublicoCacheado,
  leerCatalogoPublicoDesdeProyeccion,
} from "./lectura";

/**
 * Frontera del catálogo relacional público.
 *
 * Este módulo no importa `leer`: si falta `DATABASE_URL_PUBLIC`, falla y deja que el
 * selector pruebe `legacy`. Nunca sustituye el rol público por la conexión privilegiada.
 */
const ejecutarPublico: Ejecutor = async (texto, parametros = []) => {
  const filas = leerPublico<Record<string, unknown>>(texto, parametros);
  if (!filas) throw new Error("Falta la conexión pública del catálogo.");
  return filas;
};

const leerCatalogoPublicoSaneado = (): Promise<PublicProduct[]> =>
  leerCatalogoPublicoDesdeProyeccion(ejecutarPublico);

/**
 * Se construye una vez, fuera de cualquier petición. El valor cacheado contiene solo el
 * array `PublicProduct` que ya validó y saneó la lectura pura.
 */
export const leerCatalogoPublicoRelacional = crearLectorCatalogoPublicoCacheado(
  leerCatalogoPublicoSaneado,
  unstable_cache,
);
