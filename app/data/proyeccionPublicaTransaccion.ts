import { fromProductRow, CATALOG_COLUMNS, type CatalogRow } from "./productRow";
import { aFilaProyeccion } from "./proyeccionPublica";
import { construirUpsertProyeccion } from "./proyeccionPublicaSql";

export type EjecutorProyeccion = (
  text: string,
  params?: readonly (string | number | boolean | null)[] | readonly unknown[],
) => Promise<unknown[]>;


/**
 * Proyecta o retira un producto en public_products reutilizando una transacción
 * activa. Si el producto no está publicado o no existe, se retira de la proyección.
 * Si está publicado, ejecuta el upsert de su fila saneada.
 */
export async function proyectarProductoEnTransaccion(
  ejecutar: EjecutorProyeccion,
  referencia: string,
): Promise<void> {
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
}
