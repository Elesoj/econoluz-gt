import "server-only";

import { leer } from "../lib/datos";
import { unstable_cache } from "next/cache";
import { products } from "./products";
import { CATALOG_COLUMNS, fromProductRow, type CatalogRow } from "./productRow";
import { toPublicProduct, type PublicProduct } from "./publicProduct";

// Etiqueta con la que se marca el catálogo en la caché. El panel la usará para
// decir "esto ya no vale" al guardar un producto, y la página se rehace sola.
export const CATALOG_CACHE_TAG = "catalogo";

// Una hora. No es el plazo con el que se ven los cambios del panel —esos son
// inmediatos, porque el panel invalida la etiqueta— sino el máximo que puede
// quedar una versión vieja si algo fallara al invalidar.
const CATALOG_REVALIDATE_SECONDS = 3600;

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
    return await getCachedCatalog();
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
