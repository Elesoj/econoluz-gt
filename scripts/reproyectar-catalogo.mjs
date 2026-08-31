// Reconstruye la proyección pública entera desde `products`. Idempotente:
// ejecutarlo dos veces deja el mismo resultado.
//
// Nunca imprime la cadena de conexión, igual que scripts/migrate.mjs.

import { Client, neonConfig } from "@neondatabase/serverless";
import { fromProductRow, CATALOG_COLUMNS } from "../app/data/productRow.ts";
import { aFilaProyeccion } from "../app/data/proyeccionPublica.ts";
import { construirUpsertProyeccion } from "../app/data/proyeccionPublicaSql.ts";

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

    const consulta = construirUpsertProyeccion(proyectada);
    await client.query(consulta.texto, consulta.parametros);
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
