import "server-only";

import { leer } from "../lib/datos";
import { readCatalogStats, type CatalogStats } from "./panelStats";

/**
 * Lee el resumen de la portada por la capa de datos. Sin `DATABASE_URL`
 * devuelve `null` en vez de lanzar: en desarrollo local sin credenciales el
 * panel debe poder abrirse igual, como ya hace el catálogo público.
 *
 * La comprobación de la variable sigue aquí y no se delega en `leer`, que
 * lanzaría: es la misma política de fallo de antes del traslado, y
 * `readCatalogStats` ya devuelve `null` ante cualquier error de la consulta.
 */
export async function getCatalogStats(): Promise<CatalogStats | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return readCatalogStats((text, params) => leer<Record<string, unknown>>(text, params));
}
