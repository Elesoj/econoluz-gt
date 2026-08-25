// Crea en Neon las tablas que faltan, leyendo los archivos de db/ en orden.
//
// Es repetible: lleva la cuenta de lo que ya aplicó en una tabla propia, así
// que ejecutarlo dos veces no rompe nada ni duplica tablas. Evita tener que
// pegar SQL a mano en la consola web de Neon, que es donde es fácil ejecutar
// media instrucción y quedarse a medias.
//
// Uso:
//   npm run db:migrar

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client, neonConfig } from "@neondatabase/serverless";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "db");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Falta DATABASE_URL.\n\n" +
      "Abre el archivo frontend/.env.local y pega ahí la cadena de conexión de\n" +
      "Neon, entre las comillas. Luego vuelve a ejecutar este comando.",
  );
  process.exit(1);
}

// El driver de Neon habla por WebSocket. Node 22 en adelante trae uno nativo,
// así que no hace falta ninguna dependencia extra.
neonConfig.webSocketConstructor = globalThis.WebSocket;

const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = new Client(connectionString);

// Nunca imprimir `connectionString`: lleva la contraseña de la base de datos.
console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log(`Migraciones:    ${migrations.length} archivo(s) en db/`);
console.log("");

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select filename from schema_migrations");
  const applied = new Set(rows.map((row) => row.filename));

  let executed = 0;

  for (const filename of migrations) {
    if (applied.has(filename)) {
      console.log(`  ya estaba   ${filename}`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, filename), "utf8");

    // Cada archivo va dentro de una transacción: si una instrucción falla,
    // se deshace el archivo entero y no queda un esquema a medio crear.
    await client.query("begin");

    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
      await client.query("commit");
      console.log(`  APLICADA    ${filename}`);
      executed += 1;
    } catch (error) {
      await client.query("rollback");
      console.error(`\nFalló ${filename} y se deshizo entero:\n`);
      throw error;
    }
  }

  console.log("");
  console.log(
    executed === 0
      ? "La base de datos ya estaba al día."
      : `Listo: ${executed} migración(es) aplicada(s).`,
  );
} finally {
  await client.end();
}
