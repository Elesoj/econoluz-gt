// scripts/migrar-codigos-direcciones.mjs
//
// Migración idempotente de códigos geográficos para direcciones existentes (Ruling 1).
// Lee `user_addresses` donde falten códigos e intenta resolver de forma unívoca
// el departamento y municipio usando el catálogo oficial de `db/datos/geografia-gt.json`.
//
// Invariantes de seguridad:
// 1. NUNCA modifica los campos de texto `departamento` ni `municipio`.
// 2. Si un texto es ambiguo o desconocido, los códigos se conservan como NULL.
// 3. Prohibido registrar o imprimir identificadores o nombres de clientes (solo conteos agregados).
// 4. Modo por defecto: SIMULACIÓN con ROLLBACK.
// 5. Aplicar en producción exige simultáneamente las tres llaves de seguridad.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { Client, neonConfig } from "@neondatabase/serverless";
import { autorizarEscritura } from "./guarda-neon.mjs";

try {
  register("./ts-resolver.mjs", import.meta.url);
} catch {
  // Ignorar si ya está registrado externamente
}

const { emparejarMunicipio } = await import("../app/envios/geografia.ts");

neonConfig.webSocketConstructor = globalThis.WebSocket;

export const CONFIRMACION_DIRECCIONES_PRODUCCION = "migrar-codigos-direcciones";

export function decidirModoDirecciones(argumentos = []) {
  const lista = [...argumentos];
  if (lista.includes("--aplicar-produccion")) return "aplicar-produccion";
  if (lista.includes("--aplicar")) return "aplicar";
  return "simular";
}

/**
 * Procesa la migración o simulación de asignación de códigos geográficos
 * en user_addresses dentro de una única transacción atómica.
 *
 * @param {object} opciones
 * @param {any} opciones.cliente
 * @param {any} opciones.catalogo
 * @param {string} [opciones.modo]
 * @param {NodeJS.ProcessEnv} [opciones.entorno]
 * @param {(mensaje: string) => void} [opciones.onLog]
 */
export async function procesarMigracionDirecciones({
  cliente,
  catalogo,
  modo = "simular",
  entorno = process.env,
  onLog = () => {},
}) {
  const simular = modo === "simular";
  let transaccionAbierta = false;

  try {
    if (simular) {
      await cliente.query("begin");
      transaccionAbierta = true;
    } else {
      await autorizarEscritura(cliente, {
        modo,
        entorno,
        confirmacionEsperada: CONFIRMACION_DIRECCIONES_PRODUCCION,
      });
      await cliente.query("begin");
      transaccionAbierta = true;
    }

    const { rows } = await cliente.query(`
      select id, departamento, municipio
      from user_addresses
      where departamento_codigo is null or municipio_codigo is null
      order by id
    `);

    const totalPendientes = rows.length;
    onLog(`Direcciones con códigos pendientes: ${totalPendientes}`);

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
      } else {
        noEmparejadas++;
      }
    }

    if (simular) {
      await cliente.query("rollback");
      transaccionAbierta = false;
      onLog("ROLLBACK realizado: ningún dato modificado en la base.");
    } else {
      await cliente.query("commit");
      transaccionAbierta = false;
      onLog("COMMIT realizado: cambios persistidos con éxito.");
    }

    onLog(
      `Resumen: ${totalPendientes} pendientes evaluadas, ${emparejadas} emparejadas, ${noEmparejadas} sin cambios.`,
    );

    return {
      ok: true,
      totalPendientes,
      emparejadas,
      noEmparejadas,
      modo,
      simular,
    };
  } catch (error) {
    if (transaccionAbierta) {
      try {
        await cliente.query("rollback");
      } catch {
        // ignorar fallo secundario al revertir
      }
    }
    throw error;
  }
}

async function principal() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL en el entorno.");
    process.exit(1);
  }

  const modo = decidirModoDirecciones(process.argv.slice(2));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const geografiaPath = join(__dirname, "../db/datos/geografia-gt.json");
  const catalogo = JSON.parse(readFileSync(geografiaPath, "utf-8"));

  const cliente = new Client({ connectionString: databaseUrl });
  await cliente.connect();

  console.log(`Base de datos:  ${new URL(databaseUrl).host}`);
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

  try {
    const resultado = await procesarMigracionDirecciones({
      cliente,
      catalogo,
      modo,
      entorno: process.env,
      onLog: (msg) => console.log(msg),
    });

    console.log("");
    console.log(
      `Finalizado: ${resultado.emparejadas} actualizada(s), ${resultado.noEmparejadas} omitida(s) (${
        resultado.simular ? "simulado" : "aplicado"
      }).`,
    );
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((error) => {
    console.error("Error al migrar códigos de direcciones:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
