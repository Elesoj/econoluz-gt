// scripts/migrar-codigos-direcciones.mjs
//
// Migración idempotente de códigos geográficos para direcciones existentes (Ruling 1).
// Lee `user_addresses` donde falten códigos e intenta resolver de forma unívoca
// el departamento y municipio usando el catálogo oficial de `db/datos/geografia-gt.json`.
//
// Invariante de seguridad: NUNCA modifica los campos de texto `departamento` ni `municipio`.
// Si un texto es ambiguo o desconocido, los códigos se conservan como NULL.
// Idempotente y protegido contra ejecución accidental en producción.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { Client, neonConfig } from "@neondatabase/serverless";

try {
  register("./ts-resolver.mjs", import.meta.url);
} catch {
  // Ignorar si ya está registrado externamente
}

const { emparejarMunicipio } = await import("../app/envios/geografia.ts");

neonConfig.webSocketConstructor = globalThis.WebSocket;

const ENDPOINT_PRODUCCION = "ep-misty-sun-avmcbgly";

function endpointCanonico(host) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/-pooler(?=\.)/, "");
}

function exigirBaseDeDesarrollo(cadena, entorno = process.env) {
  if (!cadena) throw new Error("Falta DATABASE_URL.");
  const host = new URL(cadena).host;
  const conectado = endpointCanonico(host);
  const produccion = endpointCanonico(entorno.NEON_ENDPOINT_PRODUCCION || ENDPOINT_PRODUCCION);

  if (conectado.includes(ENDPOINT_PRODUCCION) || conectado === produccion) {
    throw new Error("Este script no se ejecuta contra Producción.");
  }
}

async function principal() {
  const databaseUrl = process.env.DATABASE_URL;
  exigirBaseDeDesarrollo(databaseUrl);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const geografiaPath = join(__dirname, "../db/datos/geografia-gt.json");
  const catalogo = JSON.parse(readFileSync(geografiaPath, "utf-8"));

  const cliente = new Client({ connectionString: databaseUrl });
  await cliente.connect();

  try {
    const { rows } = await cliente.query(`
      select id, departamento, municipio
      from user_addresses
      where departamento_codigo is null or municipio_codigo is null
      order by id
    `);

    console.log(`Direcciones con códigos pendientes: ${rows.length}`);

    let emparejadas = 0;
    let noEmparejadas = 0;

    for (const fila of rows) {
      const res = emparejarMunicipio(
        catalogo.municipios,
        fila.departamento,
        fila.municipio,
        catalogo.departamentos,
      );

      if (res) {
        await cliente.query(
          `update user_addresses
           set departamento_codigo = $1, municipio_codigo = $2
           where id = $3`,
          [res.departamento, res.codigo, fila.id],
        );
        emparejadas++;
        console.log(
          `  ok [${fila.id}]: "${fila.municipio}, ${fila.departamento}" -> depto ${res.departamento}, muni ${res.codigo}`,
        );
      } else {
        noEmparejadas++;
        console.log(
          `  omitida [${fila.id}]: "${fila.municipio}, ${fila.departamento}" (texto ambiguo o no encontrado; se conservan códigos null)`,
        );
      }
    }

    console.log(`Resultado: ${emparejadas} actualizadas, ${noEmparejadas} sin cambios.`);
  } finally {
    await cliente.end();
  }
}

principal().catch((error) => {
  console.error("Error al migrar códigos de direcciones:", error);
  process.exit(1);
});
