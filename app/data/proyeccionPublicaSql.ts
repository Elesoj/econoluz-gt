import { JSON_COLUMNS } from "./productRow";
import type { FilaProyeccion } from "./proyeccionPublica";

export const COLUMNAS_PROYECCION = [
  "id",
  "econoluz_reference",
  "position",
  "public_name",
  "public_description",
  "image",
  "images",
  "product_type",
  "application",
  "finish",
  "label_product_type",
  "label_application",
  "label_finish",
  "technical_specs",
  "price_cents",
] as const satisfies readonly (keyof FilaProyeccion)[];

/** Construye el único upsert usado por la proyección individual y la masiva. */
export function construirUpsertProyeccion(fila: FilaProyeccion) {
  const parametros = COLUMNAS_PROYECCION.map((columna) => {
    const valor = fila[columna];
    return JSON_COLUMNS.has(columna) && valor !== null ? JSON.stringify(valor) : valor;
  });

  const marcadores = COLUMNAS_PROYECCION.map(
    (columna, indice) => `$${indice + 1}${JSON_COLUMNS.has(columna) ? "::jsonb" : ""}`,
  );
  const actualizaciones = COLUMNAS_PROYECCION.slice(1).map(
    (columna) => `${columna} = excluded.${columna}`,
  );

  return {
    texto: `insert into public_products (${COLUMNAS_PROYECCION.join(", ")})
            values (${marcadores.join(", ")})
            on conflict (id) do update set ${actualizaciones.join(", ")}, updated_at = now()`,
    parametros,
  };
}
