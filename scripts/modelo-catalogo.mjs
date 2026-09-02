// Lee o cambia `modelo_catalogo`, siempre dentro de la rama aislada de desarrollo.
//
// `relational_v2` no se acepta aquí: activarlo es la Fase D y necesita otra autorización.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import { exigirRamaDeDesarrollo } from "./guarda-neon.mjs";

const PERMITIDOS = new Set(["legacy", "shadow"]);

export async function leerModelo(cliente) {
  const { rows } = await cliente.query(
    "select valor from app_settings where clave = 'modelo_catalogo'",
  );
  return rows[0]?.valor ?? null;
}

export async function ponerModelo(cliente, valor, entorno = process.env) {
  if (!PERMITIDOS.has(valor)) {
    throw new Error(`Valor no permitido en esta fase: ${valor}. Solo legacy o shadow.`);
  }
  await exigirRamaDeDesarrollo(cliente, entorno);
  await cliente.query("begin");
  try {
    await cliente.query(
      `update app_settings set valor = $1, actualizado_por = 'catalogo-relacional-fase-c'
        where clave = 'modelo_catalogo'`,
      [valor],
    );
    await cliente.query("commit");
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
  return leerModelo(cliente);
}

async function ejecutarDesdeTerminal() {
  const [accion, valor] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    if (accion === "--poner") {
      console.log(`modelo_catalogo = ${await ponerModelo(cliente, valor)}`);
    } else {
      await exigirRamaDeDesarrollo(cliente);
      console.log(`modelo_catalogo = ${await leerModelo(cliente)}`);
    }
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarDesdeTerminal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
