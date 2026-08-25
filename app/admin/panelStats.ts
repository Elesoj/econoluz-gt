import type { AdminAuthQuery } from "./auth/types";

/** Las tres cifras que resumen el estado del catálogo de un vistazo. */
export type CatalogStats = {
  total: number;
  publicados: number;
  conPrecio: number;
};

export const CATALOG_STATS_QUERY = `
  select
    count(*)                                        as total,
    count(*) filter (where published)               as publicados,
    count(*) filter (where price_gtq is not null)   as con_precio
  from products
`;

function aNumero(valor: unknown) {
  // Postgres devuelve los `count()` como texto: son bigint, y un bigint no
  // cabe siempre en un número de JavaScript.
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Lee el resumen del catálogo. Devuelve `null` si no se puede: la portada del
 * panel tiene que abrirse igual aunque la base de datos no conteste, porque su
 * trabajo principal —dejar entrar y navegar— no depende de estas cifras.
 */
export async function readCatalogStats(query: AdminAuthQuery): Promise<CatalogStats | null> {
  try {
    const rows = await query(CATALOG_STATS_QUERY, []);
    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      total: aNumero(row.total),
      publicados: aNumero(row.publicados),
      conPrecio: aNumero(row.con_precio),
    };
  } catch {
    return null;
  }
}
