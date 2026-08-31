import "server-only";

import { escribir } from "../lib/datos";
import { fromProductRow, CATALOG_COLUMNS, type CatalogRow } from "./productRow";
import { aFilaProyeccion, type FilaProyeccion } from "./proyeccionPublica";

const COLUMNAS = [
  "id", "econoluz_reference", "position", "public_name", "public_description",
  "image", "images", "product_type", "application", "finish",
  "label_product_type", "label_application", "label_finish",
  "technical_specs", "price_cents",
] as const;

const marcadores = COLUMNAS.map((_, indice) => `$${indice + 1}`).join(", ");
const actualizaciones = COLUMNAS.slice(1)
  .map((columna) => `${columna} = excluded.${columna}`)
  .join(", ");

const valoresDe = (fila: FilaProyeccion) =>
  COLUMNAS.map((columna) => {
    const valor = fila[columna];
    // jsonb necesita texto; el resto va tal cual.
    return columna === "images" || columna === "technical_specs"
      ? valor === null ? null : JSON.stringify(valor)
      : valor;
  });

/** Reescribe la proyección de un producto. Idempotente. */
export async function proyectarProducto(referencia: string) {
  await escribir(
    async (ejecutar) => {
      const filas = (await ejecutar(
        `select ${CATALOG_COLUMNS.join(", ")}, price_gtq, published
         from products where econoluz_reference = $1`,
        [referencia],
      )) as (CatalogRow & { price_gtq: string | null; published: boolean })[];

      const fila = filas[0];

      // Un producto despublicado no existe para el visitante: se retira de la
      // proyección en vez de quedarse con una versión vieja.
      if (!fila || !fila.published) {
        await ejecutar("delete from public_products where econoluz_reference = $1", [referencia]);
        return;
      }

      const proyectada = aFilaProyeccion(
        fromProductRow(fila),
        fila.price_gtq === null ? null : Number(fila.price_gtq),
        fila.position,
      );

      await ejecutar(
        `insert into public_products (${COLUMNAS.join(", ")}) values (${marcadores})
         on conflict (id) do update set ${actualizaciones}, updated_at = now()`,
        valoresDe(proyectada),
      );
    },
    { suceso: "proyectar-producto" },
  );
}
