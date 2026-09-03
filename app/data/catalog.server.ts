import "server-only";

import { leer, registrar } from "../lib/datos";
import { unstable_cache } from "next/cache";
import { obtenerModeloDeCatalogo } from "../lib/ajustes.server";
import {
  CATALOG_CACHE_TAG,
  CATALOG_REVALIDATE_SECONDS,
} from "./catalogo/cache";
import { compararCatalogoEnSombra } from "./catalogo/comparacion.server";
import { leerCatalogoPublicoRelacional } from "./catalogo/lectura.server";
import { servirSegunModelo } from "./catalogo/seleccion";
import { products } from "./products";
import { CATALOG_COLUMNS, fromProductRow, type CatalogRow } from "./productRow";
import { toPublicProduct, type PublicProduct } from "./publicProduct";

// Etiqueta con la que se marca el catálogo en la caché. El panel la usará para
// decir "esto ya no vale" al guardar un producto, y la página se rehace sola.
export { CATALOG_CACHE_TAG } from "./catalogo/cache";

// `price_gtq` no está en CATALOG_COLUMNS —esa lista es la del catálogo escrito
// en el código, que no tiene precios— pero sí viaja al navegador desde que el
// catálogo enseña precios. Llega como texto: `numeric` siempre lo hace.
const catalogQuery = `
  select ${CATALOG_COLUMNS.join(", ")}, price_gtq
  from products
  where published
  order by position
`;

const readCatalogFromDatabase = async (): Promise<PublicProduct[]> => {
  // La comprobación se queda aquí con su mensaje de siempre: lanzar es lo que
  // hace que `getPublicCatalog` caiga al catálogo escrito en el código.
  if (!process.env.DATABASE_URL) {
    throw new Error("falta DATABASE_URL");
  }

  // La lectura va por la capa de datos, que crea la conexión de forma perezosa:
  // así la falta de DATABASE_URL en local no revienta la importación del módulo
  // entero. La fuente **no cambia** —sigue siendo `products` con la conexión de
  // la aplicación— y la proyección pública no entra aquí todavía.
  const rows = await leer<CatalogRow & { price_gtq: string | number | null }>(
    catalogQuery,
  );

  // `toPublicProduct` es la frontera: recorta el producto a lo que puede ver
  // el navegador y deja fuera marca, serie y códigos del proveedor, que sí
  // viajan desde la base de datos hasta aquí pero no pasan de este punto.
  return rows.map((row) =>
    toPublicProduct(fromProductRow(row), {
      // `Number(null)` es cero, y cero significaría "regalado": el producto sin
      // precio tiene que llegar como `null`, no como 0.
      priceGtq: row.price_gtq === null ? null : Number(row.price_gtq),
    }),
  );
};

const getCachedCatalog = unstable_cache(readCatalogFromDatabase, ["catalogo-publico"], {
  tags: [CATALOG_CACHE_TAG],
  revalidate: CATALOG_REVALIDATE_SECONDS,
});

// El catálogo escrito en app/data/products.ts. Dejó de ser la fuente de verdad
// —ahora manda la base de datos— pero sigue siendo la red de seguridad.
const catalogFromCode = () => products.map((product) => toPublicProduct(product));

export const getPublicCatalog = async (): Promise<PublicProduct[]> => {
  if (!process.env.DATABASE_URL) {
    // En local, sin credenciales, el sitio tiene que arrancar igual: si no,
    // trabajar en el diseño exigiría conexión a internet y una base de datos.
    console.warn(
      "[catálogo] sin DATABASE_URL: se muestra el catálogo escrito en el código.",
    );

    return catalogFromCode();
  }

  try {
    // El modelo decide qué camino se sirve. En `legacy` y en `shadow` el visitante recibe
    // exactamente `getCachedCatalog()`, la lectura de siempre. `shadow` solo añade, cuando
    // la respuesta ya está decidida, una lectura del modelo nuevo y su comparación, que no
    // puede alterar ni romper lo que se devuelve.
    return await servirSegunModelo(await obtenerModeloDeCatalogo(), {
      legacy: getCachedCatalog,
      // El camino relacional está activo en Producción desde la Fase D (02/09/2026):
      // `FASE_D_AUTORIZADA` vale `true` y `modelo_catalogo` es `relational_v2`, así que
      // esto es lo que sirve el catálogo. Volver a `legacy` es cambiar la bandera de la
      // base, sin desplegar.
      relacional: leerCatalogoPublicoRelacional,
      comparar: compararCatalogoEnSombra,
      estatico: catalogFromCode,
      registrar,
    });
  } catch (error) {
    // Antes el catálogo era un archivo fijo y no podía fallar; ahora depende
    // de que Neon conteste. Si no contesta, es mejor enseñar un catálogo algo
    // desactualizado que una página rota: el cliente sigue viendo producto y
    // sigue pudiendo pedir cotización. Queda constancia en el log del servidor.
    console.error(
      "[catálogo] la base de datos no respondió; se muestra el catálogo del código. " +
        "Los cambios hechos en el panel NO se están viendo:",
      error,
    );

    return catalogFromCode();
  }
};
