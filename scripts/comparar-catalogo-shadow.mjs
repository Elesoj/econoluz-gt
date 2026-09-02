// Comparación completa del catálogo antiguo contra el relacional en la rama aislada.
//
// Se ejecuta dentro de una transacción de solo lectura y termina siempre en ROLLBACK: esta
// comparación no puede modificar nada, ni siquiera por accidente.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import {
  catalogoCanonicoDesdeLegacy,
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  CONSULTA_LEGACY_COMPLETA,
  normalizarFilaLegacy,
} from "../app/data/catalogo/comparacion.ts";
import { leerCatalogoRelacional } from "../app/data/catalogo/lectura.ts";
import { exigirRamaDeDesarrollo } from "./guarda-neon.mjs";

export async function compararEnSombra(cliente, entorno = process.env) {
  await exigirRamaDeDesarrollo(cliente, entorno);

  const sentencias = [];
  const ejecutar = async (sql, parametros = []) => {
    sentencias.push(sql);
    return (await cliente.query(sql, parametros)).rows;
  };

  const arranque = Date.now();
  const filas = await ejecutar(CONSULTA_LEGACY_COMPLETA);
  const consultasLegacy = sentencias.length;

  const ahora = new Date();
  const relacional = await leerCatalogoRelacional(ejecutar);
  const consultasRelacionales = sentencias.length - consultasLegacy;

  const resumen = compararCatalogos(
    catalogoCanonicoDesdeLegacy(filas.map(normalizarFilaLegacy)),
    catalogoCanonicoDesdeRelacional(relacional, ahora),
    Number(entorno.SHADOW_LIMITE ?? 50),
  );

  // Ninguna sentencia puede ser de escritura. Se comprueba sobre lo realmente ejecutado, no
  // sobre lo que el código dice que hace.
  const escrituras = sentencias.filter((sql) => !/^\s*select\b/i.test(sql));

  return {
    ok: resumen.totalDiferencias === 0 && escrituras.length === 0,
    ...resumen,
    consultasLegacy,
    consultasRelacionales,
    escrituras: escrituras.length,
    duracionMs: Date.now() - arranque,
  };
}

async function ejecutarDesdeTerminal() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    await cliente.query("begin transaction isolation level repeatable read read only");
    const resultado = await compararEnSombra(cliente);
    await cliente.query("rollback");
    console.log(JSON.stringify(resultado, null, 2));
    if (!resultado.ok) process.exitCode = 1;
  } catch (error) {
    await cliente.query("rollback").catch(() => undefined);
    throw error;
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
