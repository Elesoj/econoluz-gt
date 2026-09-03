// Lee o cambia `modelo_catalogo`, en la rama aislada de desarrollo o —con autorización
// expresa— en Producción.
//
// `relational_v2` se acepta desde la Fase D. Escribirlo en Producción exige las tres
// llaves del guardián; **volver a `legacy` usa exactamente este mismo camino**, y por eso
// la reversión no depende de ningún despliegue ni de ninguna variable de la aplicación.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import {
  autorizarEscritura,
  decidirDestinoDeLectura,
  exigirDestinoDeLectura,
} from "./guarda-neon.mjs";

const PERMITIDOS = new Set(["legacy", "shadow", "relational_v2"]);

/** La palabra literal que hay que escribir para tocar la bandera en Producción. */
export const CONFIRMACION_PRODUCCION = "modelo-catalogo-en-produccion";

export function valorDeModeloAceptado(valor) {
  return PERMITIDOS.has(valor);
}

export async function leerModelo(cliente) {
  const { rows } = await cliente.query(
    "select valor from app_settings where clave = 'modelo_catalogo'",
  );
  return rows[0]?.valor ?? null;
}

export async function ponerModelo(cliente, valor, entorno = process.env, destino = "desarrollo") {
  if (!valorDeModeloAceptado(valor)) {
    throw new Error(`Valor no permitido: ${valor}. Solo legacy, shadow o relational_v2.`);
  }

  await autorizarEscritura(cliente, {
    modo: destino === "produccion" ? "aplicar-produccion" : "aplicar",
    entorno,
    confirmacionEsperada: CONFIRMACION_PRODUCCION,
  });

  await cliente.query("begin");
  try {
    await cliente.query(
      `update app_settings set valor = $1, actualizado_por = $2
        where clave = 'modelo_catalogo'`,
      [valor, destino === "produccion" ? "catalogo-relacional-fase-d" : "catalogo-relacional-fase-c"],
    );
    await cliente.query("commit");
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
  return leerModelo(cliente);
}

async function ejecutarDesdeTerminal() {
  const argumentos = process.argv.slice(2);
  const destino = decidirDestinoDeLectura(argumentos);
  const indice = argumentos.indexOf("--poner");
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    if (indice !== -1) {
      const valor = argumentos[indice + 1];
      console.log(
        `modelo_catalogo = ${await ponerModelo(cliente, valor, process.env, destino)} (${destino})`,
      );
    } else {
      await exigirDestinoDeLectura(cliente, process.env, destino);
      console.log(`modelo_catalogo = ${await leerModelo(cliente)} (${destino})`);
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
