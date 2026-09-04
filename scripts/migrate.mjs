// Crea en Neon las tablas que faltan, leyendo los archivos de db/ en orden.
//
// Es repetible: lleva la cuenta de lo que ya aplicó en una tabla propia, así
// que ejecutarlo dos veces no rompe nada ni duplica tablas. Evita tener que
// pegar SQL a mano en la consola web de Neon, que es donde es fácil ejecutar
// media instrucción y quedarse a medias.
//
// Uso:
//   npm run db:migrar                 aplica lo que falte en desarrollo sellado
//   npm run db:migrar -- --simular    lo aplica todo dentro de una transacción y la
//                                     revierte: comprueba de verdad que el SQL entra,
//                                     sin dejar nada escrito
//   node scripts/migrate.mjs --aplicar-produccion  aplica en Producción exigiendo las tres llaves

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client, neonConfig } from "@neondatabase/serverless";
import { autorizarEscritura } from "./guarda-neon.mjs";

export const CONFIRMACION_MIGRAR_PRODUCCION = "migrar-en-produccion";

export function decidirModoMigracion(argumentos = []) {
  const lista = [...argumentos];
  if (lista.includes("--simular")) return "simular";
  if (lista.includes("--aplicar-produccion")) return "aplicar-produccion";
  if (lista.includes("--aplicar")) return "aplicar";
  return "aplicar";
}

/**
 * Ejecuta el migrador con el cliente y dependencias provistas.
 * Permite probar unitariamente la secuencia transaccional y las protecciones.
 */
export async function ejecutarMigrador({
  client,
  migrations,
  leerSql,
  modo = "aplicar",
  entorno = process.env,
  onLog = () => {},
}) {
  const simular = modo === "simular";
  let transaccionAbierta = false;

  try {
    if (simular) {
      // 1. En modo simulación, BEGIN debe ejecutarse antes de cualquier DDL,
      // incluida la creación condicional de schema_migrations.
      await client.query("begin");
      transaccionAbierta = true;
    } else {
      // 2. Para escribir en desarrollo o producción, exigir autorizacion estricta.
      await autorizarEscritura(client, {
        modo,
        entorno,
        confirmacionEsperada: CONFIRMACION_MIGRAR_PRODUCCION,
      });
    }

    await client.query(`
      create table if not exists schema_migrations (
        filename   text        primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query("select filename from schema_migrations");
    const applied = new Set((rows ?? []).map((row) => row.filename));

    let executed = 0;
    const pendientes = migrations.filter((filename) => !applied.has(filename));
    for (const filename of migrations) {
      if (applied.has(filename)) onLog(`  ya estaba   ${filename}`);
    }

    for (const filename of pendientes) {
      const sql = leerSql(filename);

      if (!simular) await client.query("begin");

      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
        if (!simular) await client.query("commit");
        onLog(`  ${simular ? "SIMULADA" : "APLICADA"}    ${filename}`);
        executed += 1;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    if (simular) {
      await client.query("rollback");
      transaccionAbierta = false;
      onLog("ROLLBACK hecho: la base queda exactamente como estaba.");
    }

    return {
      ok: true,
      executed,
      simular,
      destino: modo === "aplicar-produccion" ? "produccion" : simular ? "simulacion" : "desarrollo",
    };
  } catch (error) {
    if (simular && transaccionAbierta) {
      try {
        await client.query("rollback");
      } catch {
        // ignorar fallo secundario al revertir
      }
    }
    throw error;
  }
}

async function principal() {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationsDir = join(projectRoot, "db");

  const modo = decidirModoMigracion(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      "Falta DATABASE_URL.\n\n" +
        "Abre el archivo frontend/.env.local y pega ahí la cadena de conexión de\n" +
        "Neon, entre las comillas. Luego vuelve a ejecutar este comando.",
    );
    process.exit(1);
  }

  neonConfig.webSocketConstructor = globalThis.WebSocket;

  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = new Client(connectionString);

  console.log(`Base de datos:  ${new URL(connectionString).host}`);
  console.log(`Migraciones:    ${migrations.length} archivo(s) en db/`);
  console.log(
    `Modo:           ${
      modo === "simular"
        ? "SIMULACIÓN (termina en ROLLBACK)"
        : modo === "aplicar-produccion"
        ? "APLICACIÓN EN PRODUCCIÓN (tres llaves verificadas)"
        : "aplicación en desarrollo sellado"
    }`,
  );
  console.log("");

  await client.connect();

  try {
    const res = await ejecutarMigrador({
      client,
      migrations,
      leerSql: (filename) => readFileSync(join(migrationsDir, filename), "utf8"),
      modo,
      entorno: process.env,
      onLog: (msg) => console.log(msg),
    });

    console.log("");
    console.log(
      res.executed === 0
        ? "La base de datos ya estaba al día."
        : `Listo: ${res.executed} migración(es) ${res.simular ? "simulada(s)" : "aplicada(s)"}.`,
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
