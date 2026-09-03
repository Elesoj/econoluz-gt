import "server-only";

import { leer, type Ejecutor } from "../../lib/datos";
import { desdeFilaProyeccion } from "../proyeccionPublica";
import type { PublicProduct } from "../publicProduct";
import {
  buscarPorCodigoDeProveedor as buscarConEjecutor,
  leerCatalogoRelacional as leerCatalogoConEjecutor,
  leerProductoRelacional as leerProductoConEjecutor,
  proyeccionDesdeRelacional as proyeccionDesdeRelacionalConEjecutor,
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
 * El catálogo público reconstruido desde el modelo relacional.
 *
 * **Es la pieza que servirá la Fase D**, y hoy no la llama nadie: `servirSegunModelo` solo
 * llega aquí con `modelo_catalogo = relational_v2` y la llave `FASE_D_AUTORIZADA` abierta,
 * y ambas están cerradas. Existe cableada a propósito: si la Fase D se limitara a abrir la
 * llave sin conectar esto, el sitio caería al catálogo escrito en el código sin que nadie
 * lo esperase.
 *
 * **Sin caché todavía.** La lectura `legacy` se apoya en `unstable_cache` con la etiqueta
 * `CATALOG_CACHE_TAG`, que el panel invalida al guardar. Decidir la caché de este camino
 * —y quién la invalida— es trabajo de la Fase D, no de la Fase C: cachearlo ahora sería
 * fijar una decisión que todavía no se ha tomado.
 */
export async function leerCatalogoPublicoRelacional(): Promise<PublicProduct[]> {
  const ahora = new Date();
  const productos = await leerCatalogoConEjecutor(ejecutarPrivado);

  return productos
    .filter((producto) => producto.nucleo.published)
    .sort(
      (a, b) =>
        a.nucleo.position - b.nucleo.position ||
        a.nucleo.econoluz_reference.localeCompare(b.nucleo.econoluz_reference),
    )
    .map((producto) => desdeFilaProyeccion(proyeccionDesdeRelacionalConEjecutor(producto, ahora)));
}

export { proyeccionDesdeRelacional } from "./lectura";
export type { ProductoRelacional } from "./lectura";
