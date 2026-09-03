// Quita de `products.images` las entradas que repiten exactamente la imagen principal.
//
// Es la corrección autorizada por el dueño el 02/09/2026: los 64 productos con galería
// repetían su foto principal como primera miniatura, y esa repetición era la única causa
// de las 128 diferencias entre el catálogo antiguo y el relacional.
//
// **Solo se quita la coincidencia exacta** con `products.image`. Cualquier otra
// fotografía se conserva, en su orden, y no se borra ni un archivo de disco ni de Blob:
// esto únicamente deja de referenciar una ruta que ya estaba referenciada dos veces.
//
// Tres modos:
//   --simular              cuenta y enseña el plan, sin escribir nada
//   --aplicar              escribe en una sola transacción; ROLLBACK si el número no cuadra
//   --restaurar <archivo>  devuelve `images` a lo que dice el respaldo
//
// `--aplicar` y `--restaurar` exigen el guardián de rama: sin el endpoint y el marcador de
// la rama aislada correctos, no escriben.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import {
  decidirEscrituraEnProduccion as decidirEnProduccion,
  exigirRamaDeDesarrollo,
  interpretarBandera,
} from "./guarda-neon.mjs";

/** La palabra exacta que hay que escribir para poder tocar Producción con este comando. */
export const CONFIRMACION_PRODUCCION = "limpiar-galerias-produccion";

/**
 * La decisión vive en `guarda-neon.mjs`, compartida con los demás comandos que pueden
 * escribir: una sola implementación que endurecer, y no tres que se van separando.
 */
export function decidirEscrituraEnProduccion({ host, hostProduccion, confirmacion, bandera }) {
  return decidirEnProduccion({
    host,
    hostProduccion,
    confirmacion,
    esperada: CONFIRMACION_PRODUCCION,
    bandera,
  });
}

/** Cuántos productos deben quedar afectados. Si no son exactamente estos, se revierte. */
export const AFECTADOS_ESPERADOS = 64;

export const CONSULTA_GALERIAS =
  "select id, econoluz_reference, image, images from products order by position, id";

/**
 * Qué hay que cambiar en un producto, o `null` si no hay nada que cambiar.
 *
 * `nuevas` vale `null` —y no `[]`— cuando no queda ninguna fotografía adicional: en esta
 * tabla `null` significa «sin galería» y una lista vacía sería un estado distinto que el
 * resto del código no espera.
 */
export function planDeLimpieza(fila) {
  const original = Array.isArray(fila.images) ? fila.images : null;
  if (!original || original.length === 0) return null;

  const conservadas = original.filter((url) => url !== fila.image);
  if (conservadas.length === original.length) return null;

  return {
    id: String(fila.id),
    referencia: String(fila.econoluz_reference),
    imagen: String(fila.image),
    original,
    nuevas: conservadas.length > 0 ? conservadas : null,
    quitadas: original.length - conservadas.length,
  };
}

export function resumirPlan(filas) {
  const planes = filas.map(planDeLimpieza).filter(Boolean);
  return {
    revisados: filas.length,
    afectados: planes.length,
    repeticionesQuitadas: planes.reduce((total, plan) => total + plan.quitadas, 0),
    secundariasConservadas: planes.reduce(
      (total, plan) => total + (plan.nuevas?.length ?? 0),
      0,
    ),
    soloLaRepetida: planes.filter((plan) => plan.nuevas === null).length,
    conSecundariasReales: planes.filter((plan) => plan.nuevas !== null).length,
    planes,
  };
}

/** El respaldo solo lleva datos públicos: id, referencia, ruta principal y galería. */
export function armarRespaldo(resumen, etiqueta) {
  return {
    generado: new Date().toISOString(),
    rama: etiqueta,
    motivo: "Fase C: quitar de products.images la repeticion exacta de products.image",
    afectados: resumen.afectados,
    productos: resumen.planes.map((plan) => ({
      id: plan.id,
      referencia: plan.referencia,
      imagen: plan.imagen,
      imagesOriginal: plan.original,
      imagesNuevo: plan.nuevas,
    })),
  };
}

const leerFilas = async (cliente) => (await cliente.query(CONSULTA_GALERIAS)).rows;

export async function simular(cliente) {
  return resumirPlan(await leerFilas(cliente));
}

export async function aplicar(cliente, entorno = process.env, rutaRespaldo, destino = "desarrollo") {
  if (destino === "produccion") {
    const decision = decidirEscrituraEnProduccion({
      host: new URL(entorno.DATABASE_URL).host,
      hostProduccion: entorno.NEON_ENDPOINT_PRODUCCION,
      confirmacion: entorno.CONFIRMAR_PRODUCCION,
      bandera: interpretarBandera(entorno.PERMITIR_ESCRITURA_PRODUCCION),
    });
    if (!decision.ok) throw new Error(decision.motivo);
  } else {
    await exigirRamaDeDesarrollo(cliente, entorno);
  }

  const resumen = resumirPlan(await leerFilas(cliente));

  if (rutaRespaldo) {
    mkdirSync(dirname(rutaRespaldo), { recursive: true });
    writeFileSync(
      rutaRespaldo,
      `${JSON.stringify(
        armarRespaldo(
          resumen,
          destino === "produccion" ? "produccion" : entorno.NEON_RAMA_ESPERADA,
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  await cliente.query("begin");
  try {
    let escritos = 0;
    for (const plan of resumen.planes) {
      const { rowCount } = await cliente.query(
        "update products set images = $1 where id = $2",
        [plan.nuevas === null ? null : JSON.stringify(plan.nuevas), plan.id],
      );
      escritos += rowCount;
    }

    if (escritos !== AFECTADOS_ESPERADOS) {
      await cliente.query("rollback");
      return { ok: false, escritos, motivo: `se esperaban ${AFECTADOS_ESPERADOS} filas` };
    }

    // Se relee dentro de la misma transacción: si algo quedara repetido, se revierte.
    const restantes = resumirPlan(await leerFilas(cliente)).afectados;
    if (restantes !== 0) {
      await cliente.query("rollback");
      return { ok: false, escritos, motivo: `quedan ${restantes} productos por limpiar` };
    }

    await cliente.query("commit");
    return { ok: true, escritos, resumen };
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
}

export async function restaurar(cliente, rutaRespaldo, entorno = process.env) {
  const respaldo = JSON.parse(readFileSync(rutaRespaldo, "utf8"));

  // El propio respaldo dice dónde se hizo la limpieza, así que la vuelta atrás usa el
  // mismo guardián que la ida. Si no, Producción se podría limpiar pero no deshacer.
  if (respaldo.rama === "produccion") {
    const decision = decidirEscrituraEnProduccion({
      host: new URL(entorno.DATABASE_URL).host,
      hostProduccion: entorno.NEON_ENDPOINT_PRODUCCION,
      confirmacion: entorno.CONFIRMAR_PRODUCCION,
      bandera: interpretarBandera(entorno.PERMITIR_ESCRITURA_PRODUCCION),
    });
    if (!decision.ok) throw new Error(decision.motivo);
  } else {
    await exigirRamaDeDesarrollo(cliente, entorno);
  }

  await cliente.query("begin");
  try {
    let escritos = 0;
    for (const producto of respaldo.productos) {
      const { rowCount } = await cliente.query(
        "update products set images = $1 where id = $2",
        [JSON.stringify(producto.imagesOriginal), producto.id],
      );
      escritos += rowCount;
    }
    if (escritos !== respaldo.productos.length) {
      await cliente.query("rollback");
      return { ok: false, escritos, motivo: "el respaldo no cuadra con la base" };
    }
    await cliente.query("commit");
    return { ok: true, escritos };
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
}

async function ejecutarDesdeTerminal() {
  const [accion, argumento] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");

  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();

  try {
    if (accion === "--aplicar" || accion === "--aplicar-produccion") {
      const destino = accion === "--aplicar-produccion" ? "produccion" : "desarrollo";
      const resultado = await aplicar(cliente, process.env, argumento, destino);
      console.log(JSON.stringify({ destino, ...resultado, resumen: undefined }, null, 2));
      if (!resultado.ok) process.exitCode = 1;
    } else if (accion === "--restaurar") {
      if (!argumento) throw new Error("Uso: --restaurar <archivo de respaldo>");
      console.log(JSON.stringify(await restaurar(cliente, argumento), null, 2));
    } else {
      const resumen = await simular(cliente);
      console.log(
        JSON.stringify(
          { ...resumen, planes: resumen.planes.slice(0, 3), muestra: "3 de los planes" },
          null,
          2,
        ),
      );
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
