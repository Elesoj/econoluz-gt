import "server-only";

import { neon } from "@neondatabase/serverless";
import { readCatalogStats, type CatalogStats } from "./panelStats";

/**
 * Conecta con Neon para el resumen de la portada. Sin `DATABASE_URL` devuelve
 * `null` en vez de lanzar: en desarrollo local sin credenciales el panel debe
 * poder abrirse igual, como ya hace el catálogo público.
 */
export async function getCatalogStats(): Promise<CatalogStats | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  const sql = neon(connectionString);
  return readCatalogStats((text, params) => sql.query(text, [...params]));
}
