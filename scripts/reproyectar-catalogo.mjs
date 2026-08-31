// Reconstruye la proyección pública entera desde `products`. Idempotente:
// ejecutarlo dos veces deja el mismo resultado.
//
// Nunca imprime la cadena de conexión, igual que scripts/migrate.mjs.

import { Client, neonConfig } from "@neondatabase/serverless";
import { fromProductRow, CATALOG_COLUMNS } from "../app/data/productRow.ts";
import { aFilaProyeccion } from "../app/data/proyeccionPublica.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL. Ponla en frontend/.env.local y repite.");
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;
console.log(`Base de datos:  ${new URL(connectionString).host}`);

const client = new Client(connectionString);
await client.connect();

try {
  await client.query("begin");

  // `position` ya viene dentro de CATALOG_COLUMNS (ver app/data/productRow.ts),
  // así que no se repite aquí: pedirla dos veces solo duplicaría la columna en
  // el resultado sin aportar nada.
  const { rows } = await client.query(
    `select ${CATALOG_COLUMNS.join(", ")}, price_gtq
     from products where published order by position`,
  );

  for (const fila of rows) {
    const proyectada = aFilaProyeccion(
      fromProductRow(fila),
      fila.price_gtq === null ? null : Number(fila.price_gtq),
      fila.position,
    );

    await client.query(
      `insert into public_products (
         id, econoluz_reference, position, public_name, public_description,
         image, images, product_type, application, finish,
         label_product_type, label_application, label_finish,
         technical_specs, price_cents
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set
         econoluz_reference = excluded.econoluz_reference,
         position = excluded.position,
         public_name = excluded.public_name,
         public_description = excluded.public_description,
         image = excluded.image,
         images = excluded.images,
         product_type = excluded.product_type,
         application = excluded.application,
         finish = excluded.finish,
         label_product_type = excluded.label_product_type,
         label_application = excluded.label_application,
         label_finish = excluded.label_finish,
         technical_specs = excluded.technical_specs,
         price_cents = excluded.price_cents,
         updated_at = now()`,
      [
        proyectada.id, proyectada.econoluz_reference, proyectada.position,
        proyectada.public_name, proyectada.public_description, proyectada.image,
        proyectada.images === null ? null : JSON.stringify(proyectada.images),
        proyectada.product_type, proyectada.application, proyectada.finish,
        proyectada.label_product_type, proyectada.label_application,
        proyectada.label_finish,
        proyectada.technical_specs === null ? null : JSON.stringify(proyectada.technical_specs),
        proyectada.price_cents,
      ],
    );
  }

  // Lo que ya no está publicado deja de existir para el visitante.
  const retiradas = await client.query(
    `delete from public_products
     where econoluz_reference not in (
       select econoluz_reference from products where published
     )`,
  );

  await client.query("commit");
  console.log(`Proyectados:  ${rows.length}`);
  console.log(`Retirados:    ${retiradas.rowCount}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
