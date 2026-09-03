import "server-only";

import { unstable_cache } from "next/cache";
import { leer, leerPublico, type Ejecutor } from "../../lib/datos";
import type { PublicProduct } from "../publicProduct";
import {
  buscarPorCodigoDeProveedor as buscarConEjecutor,
  crearLectorCatalogoPublicoCacheado,
  leerCatalogoPublicoDesdeProyeccion,
  leerCatalogoRelacional as leerCatalogoConEjecutor,
  leerProductoRelacional as leerProductoConEjecutor,
} from "./lectura";

const ejecutarPrivado: Ejecutor = (texto, parametros = []) =>
  leer<Record<string, unknown>>(texto, parametros);

/** Lectura interna de un producto; nunca usa el rol público. */
export function leerProductoRelacional(id: string) {
  return leerProductoConEjecutor(ejecutarPrivado, id);
}

/** Lectura interna completa para verificación y futuras acciones del panel. */
export function leerCatalogoRelacional() {
  return leerCatalogoConEjecutor(ejecutarPrivado);
}

/** El código del proveedor solo se busca mediante la conexión privilegiada. */
export function buscarPorCodigoDeProveedor(texto: string) {
  return buscarConEjecutor(ejecutarPrivado, texto);
}

/**
 * El catálogo público se limita a la proyección saneada y al rol público.
 *
 * **Es la pieza que servirá la Fase D**, y hoy no la llama nadie: `servirSegunModelo` solo
 * llega aquí con `modelo_catalogo = relational_v2` y la llave `FASE_D_AUTORIZADA` abierta,
 * y ambas están cerradas. Existe cableada a propósito: si la Fase D se limitara a abrir la
 * llave sin conectar esto, el sitio caería al catálogo escrito en el código sin que nadie
 * lo esperase.
 *
 * La función cacheada se construye una vez, fuera de cualquier petición. Dentro solo se
 * obtiene y valida el resultado público: no entran ejecutores, conexiones, errores ni
 * datos dinámicos de la petición en el valor almacenado.
 */
const ejecutarPublico: Ejecutor = async (texto, parametros = []) => {
  const filas = leerPublico<Record<string, unknown>>(texto, parametros);
  if (!filas) throw new Error("Falta la conexión pública del catálogo.");
  return filas;
};

const leerCatalogoPublicoSaneado = (): Promise<PublicProduct[]> =>
  leerCatalogoPublicoDesdeProyeccion(ejecutarPublico);

export const leerCatalogoPublicoRelacional = crearLectorCatalogoPublicoCacheado(
  leerCatalogoPublicoSaneado,
  unstable_cache,
);

export { proyeccionDesdeRelacional } from "./lectura";
export type { ProductoRelacional } from "./lectura";
