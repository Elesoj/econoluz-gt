import "server-only";

import { escribir } from "../lib/datos";
import { fromProductRow, CATALOG_COLUMNS, type CatalogRow } from "./productRow";
import { aFilaProyeccion } from "./proyeccionPublica";
import { construirUpsertProyeccion } from "./proyeccionPublicaSql";

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

      const consulta = construirUpsertProyeccion(proyectada);
      await ejecutar(consulta.texto, consulta.parametros);
    },
    { suceso: "proyectar-producto" },
  );
}
