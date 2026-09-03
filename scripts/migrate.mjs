// Crea en Neon las tablas que faltan, leyendo los archivos de db/ en orden.
//
// Es repetible: lleva la cuenta de lo que ya aplicó en una tabla propia, así
// que ejecutarlo dos veces no rompe nada ni duplica tablas. Evita tener que
// pegar SQL a mano en la consola web de Neon, que es donde es fácil ejecutar
// media instrucción y quedarse a medias.
//
// Uso:
//   npm run db:migrar                 aplica lo que falte
//   npm run db:migrar -- --simular    lo aplica todo dentro de una transacción y la
//                                     revierte: comprueba de verdad que el SQL entra,
//                                     sin dejar nada escrito

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client, neonConfig } from "@neondatabase/serverless";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "db");

const simular = process.argv.slice(2).includes("--simular");
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
console.log(`Modo:           ${simular ? "SIMULACIÓN (termina en ROLLBACK)" : "aplicación real"}`);
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
  const pendientes = migrations.filter((filename) => !applied.has(filename));
  for (const filename of migrations) {
    if (applied.has(filename)) console.log(`  ya estaba   ${filename}`);
  }

  // La simulación mete **todas** las pendientes en una sola transacción y la revierte.
  // Archivo por archivo no valdría: una migración puede apoyarse en la anterior, y
  // revirtiendo cada una por separado la siguiente correría sobre un esquema que no
  // existe. Así se comprueba la secuencia entera, que es justo la que se va a aplicar.
  if (simular) await client.query("begin");

  for (const filename of pendientes) {
    const sql = readFileSync(join(migrationsDir, filename), "utf8");

    // Fuera de la simulación, cada archivo va dentro de su propia transacción: si una
    // instrucción falla, se deshace el archivo entero y no queda un esquema a medias.
    if (!simular) await client.query("begin");

    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
      if (!simular) await client.query("commit");
      console.log(`  ${simular ? "SIMULADA" : "APLICADA"}    ${filename}`);
      executed += 1;
    } catch (error) {
      await client.query("rollback");
      console.error(`\nFalló ${filename} y se deshizo entero:\n`);
      throw error;
    }
  }

  if (simular) {
    await client.query("rollback");
    console.log("");
    console.log("ROLLBACK hecho: la base queda exactamente como estaba.");
  }

  console.log("");
  console.log(
    executed === 0
      ? "La base de datos ya estaba al día."
      : `Listo: ${executed} migración(es) ${simular ? "simulada(s)" : "aplicada(s)"}.`,
  );
} finally {
  await client.end();
}
