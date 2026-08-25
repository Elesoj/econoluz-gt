// Lleva los 313 productos de app/data/products.ts a la tabla `products`.
//
// Se puede ejecutar las veces que haga falta: actualiza el producto que ya
// existe en lugar de duplicarlo. Y respeta a propósito cuatro columnas que
// NO vienen del código sino del panel — precio, existencias, si se vende en
// línea y si está publicado — para que reimportar no borre el trabajo de
// cargar precios, que es la tarea más lenta del proyecto.
//
// Al terminar vuelve a leer la base de datos y compara lo que hay dentro con
// la foto congelada del catálogo. No da por buena la importación porque el
// insert no diera error: la da por buena porque lo que quedó guardado
// reconstruye el catálogo idéntico.
//
// Uso:
//   npm run catalogo:importar

import { Client, neonConfig } from "@neondatabase/serverless";
import { products } from "../app/data/products.ts";
import { fromProductRow, toProductRow } from "../app/data/productRow.ts";
import { compareCatalogs, reportProblems } from "./compare-catalog.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Falta DATABASE_URL.\n\n" +
      "Abre frontend/.env.local y pega ahí la cadena de conexión de Neon.",
  );
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;

// El orden manda: es el que se usa para construir el INSERT y para leer de
// vuelta, así que las dos mitades no se pueden desincronizar.
const COLUMNS = [
  "id",
  "econoluz_reference",
  "position",
  "public_name",
  "public_description",
  "image",
  "images",
  "technical_specs",
  "product_type",
  "product_type_label",
  "application",
  "application_label",
  "finish",
  "finish_label",
  "family_label",
  "supplier_brand",
  "supplier_brand_label",
  "supplier_series",
  "supplier_series_label",
  "supplier_code",
  "supplier_name",
  "supplier_description",
];

// Columnas que administra la persona, no el código. Reimportar no las toca.
const COLUMNS_DEL_PANEL = ["price_gtq", "stock", "sellable_online", "published"];

const JSON_COLUMNS = new Set(["images", "technical_specs"]);

const BATCH_SIZE = 50;

const rows = products.map((product, index) => toProductRow(product, index));
const client = new Client(connectionString);

console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log(`Productos:      ${rows.length}`);
console.log("");

await client.connect();

try {
  const antes = await client.query("select count(*)::int as n from products");
  console.log(`Ya había en la tabla: ${antes.rows[0].n}`);

  // --- Importar ------------------------------------------------------------
  let escritos = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const placeholders = [];

    for (const row of batch) {
      const slots = COLUMNS.map((column) => {
        const value = JSON_COLUMNS.has(column)
          ? (row[column] === null ? null : JSON.stringify(row[column]))
          : row[column];

        values.push(value);

        return `$${values.length}${JSON_COLUMNS.has(column) ? "::jsonb" : ""}`;
      });

      placeholders.push(`(${slots.join(", ")})`);
    }

    // `excluded` es la fila que se intentaba insertar. Las columnas del panel
    // no aparecen aquí, así que conservan lo que ya hubiera guardado.
    const updates = COLUMNS.filter((column) => column !== "id")
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");

    const result = await client.query(
      `insert into products (${COLUMNS.join(", ")})
       values ${placeholders.join(", ")}
       on conflict (id) do update set ${updates}`,
      values,
    );

    escritos += result.rowCount ?? batch.length;
    process.stdout.write(`\r  escritos ${escritos} / ${rows.length}`);
  }

  console.log("");

  // --- Leer de vuelta y comprobar -----------------------------------------
  console.log("");
  console.log("Comprobando contra la foto congelada del catálogo...");

  const leidos = await client.query(
    `select ${[...COLUMNS, ...COLUMNS_DEL_PANEL].join(", ")}
     from products order by position`,
  );

  const reconstruido = leidos.rows.map((row) => fromProductRow(row));
  const problemas = compareCatalogs(products, reconstruido);

  console.log("");
  console.log(`En la tabla ahora:  ${leidos.rows.length}`);
  console.log(`Con precio puesto:  ${leidos.rows.filter((row) => row.price_gtq !== null).length}`);
  console.log(`Publicados:         ${leidos.rows.filter((row) => row.published).length}`);
  console.log("");

  reportProblems(
    problemas,
    `OK: los ${products.length} productos están en la base de datos y reconstruyen el\n` +
      "    catálogo exactamente igual que el código, campo por campo.",
  );
} finally {
  await client.end();
}
