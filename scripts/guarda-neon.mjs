// Impide que las operaciones de la Fase B escriban fuera de su rama aislada.
//
// La comprobación es deliberadamente positiva: deben coincidir el endpoint configurado y
// el marcador persistido en `app_settings`. Además se exige conocer el endpoint de
// Producción y se lo rechaza expresamente, incluso si alguien lo copiase por error como
// endpoint esperado.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

const CLAVE_RAMA = "rama_neon";
const BLOQUEO_SELLADO = 20260902;

export function endpointCanonico(host) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/-pooler(?=\.)/, "");
}

function decidirEndpointSeguro({ host, hostEsperado, hostProduccion, ramaEsperada }) {
  if (!hostEsperado || !hostProduccion || !ramaEsperada) {
    return {
      ok: false,
      motivo:
        "Falta configuración segura: NEON_ENDPOINT_ESPERADO, NEON_ENDPOINT_PRODUCCION o NEON_RAMA_ESPERADA.",
    };
  }

  const conectado = endpointCanonico(host);
  const esperado = endpointCanonico(hostEsperado);
  const produccion = endpointCanonico(hostProduccion);

  if (!conectado || conectado !== esperado) {
    return { ok: false, motivo: `El endpoint conectado no es el esperado: ${host || "vacío"}.` };
  }
  if (conectado === produccion) {
    return { ok: false, motivo: "El endpoint conectado es el de Producción; escritura prohibida." };
  }

  return { ok: true };
}

/**
 * Los tres modos de cualquier script que pueda escribir. **`simular` es el de por
 * defecto**: un script que escribe por el mero hecho de ejecutarlo acaba escribiendo por
 * accidente, y estos tocan el catálogo entero.
 */
export function decidirModo(argumentos = []) {
  const lista = [...argumentos];
  if (lista.includes("--aplicar-produccion")) return "aplicar-produccion";
  if (lista.includes("--aplicar")) return "aplicar";
  return "simular";
}

/**
 * Una bandera de entorno, sin trucos de veracidad: solo la cadena exacta `"true"`.
 * `"1"`, `"si"` o `"False"` son verdaderos en JavaScript y no deben abrir nada.
 */
export function interpretarBandera(valor) {
  return valor === "true";
}

/**
 * Escribir en Producción exige **tres cosas a la vez**, y ninguna sola basta: estar
 * conectado justo a su endpoint, haber levantado la bandera explícita, y escribir la
 * confirmación literal de esa operación concreta. Cada una por separado puede darse por
 * descuido —una variable heredada, un comando copiado—; las tres juntas, no.
 *
 * Esto **no relaja** `exigirRamaDeDesarrollo`: es un camino aparte, que el guardián de
 * rama sigue rechazando.
 */
export function decidirEscrituraEnProduccion({
  host,
  hostProduccion,
  confirmacion,
  esperada,
  bandera,
}) {
  if (!hostProduccion) {
    return { ok: false, motivo: "Falta NEON_ENDPOINT_PRODUCCION: no se sabe cuál es." };
  }
  if (bandera !== true) {
    return { ok: false, motivo: "Falta la bandera explícita de escritura en Producción." };
  }
  if (!esperada || confirmacion !== esperada) {
    return { ok: false, motivo: `Falta la confirmación literal «${esperada}».` };
  }

  const conectado = endpointCanonico(host);
  if (!conectado || conectado !== endpointCanonico(hostProduccion)) {
    return {
      ok: false,
      motivo: `El endpoint conectado no es el de Producción: ${host || "vacío"}.`,
    };
  }

  return { ok: true };
}

/**
 * Leer Producción es otra cosa que escribir en ella, y confundirlas tiene coste en las dos
 * direcciones: si se exigieran las tres llaves para una comparación de solo lectura, la
 * gente acabaría teniéndolas puestas «por si acaso», que es justo lo que las inutiliza.
 *
 * Aquí basta con **pedirlo por su nombre** y estar conectado al endpoint de Producción. La
 * operación no puede escribir —va dentro de una transacción de solo lectura que termina en
 * `ROLLBACK`—, así que la garantía la da la propia transacción, no la ceremonia.
 */
export function decidirDestinoDeLectura(argumentos = []) {
  return [...argumentos].includes("--produccion") ? "produccion" : "desarrollo";
}

export function decidirLecturaEnProduccion({ host, hostProduccion }) {
  if (!hostProduccion) {
    return { ok: false, motivo: "Falta NEON_ENDPOINT_PRODUCCION: no se sabe cuál es." };
  }

  const conectado = endpointCanonico(host);
  if (!conectado || conectado !== endpointCanonico(hostProduccion)) {
    return {
      ok: false,
      motivo: `El endpoint conectado no es el de Producción: ${host || "vacío"}.`,
    };
  }

  return { ok: true };
}

/** El guardián que toca según a dónde se quiera leer. Lanza cuando no cuadra. */
export async function exigirDestinoDeLectura(cliente, entorno = process.env, destino = "desarrollo") {
  if (destino !== "produccion") {
    await exigirRamaDeDesarrollo(cliente, entorno);
    return;
  }

  if (!entorno.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  const decision = decidirLecturaEnProduccion({
    host: new URL(entorno.DATABASE_URL).host,
    hostProduccion: entorno.NEON_ENDPOINT_PRODUCCION,
  });
  if (!decision.ok) throw new Error(decision.motivo);
}

/** Un conteo solo vale si es un entero y es exactamente el que se esperaba. */
export function comprobarConteo({ esperado, obtenido, etiqueta = "filas" }) {
  if (!Number.isInteger(obtenido)) {
    return { ok: false, motivo: `El conteo de ${etiqueta} no es un entero: ${String(obtenido)}.` };
  }
  if (obtenido !== esperado) {
    return {
      ok: false,
      motivo: `Se esperaban ${esperado} ${etiqueta} y salieron ${obtenido}.`,
    };
  }
  return { ok: true };
}

/**
 * Decide y aplica el guardián que toque según el modo. Devuelve si hay que escribir.
 * Lanza —y por tanto corta el script— cuando la escritura no está autorizada.
 */
export async function autorizarEscritura(cliente, { modo, entorno = process.env, confirmacionEsperada }) {
  if (modo === "simular") return { escribe: false, destino: "simulacion" };

  if (modo === "aplicar-produccion") {
    const decision = decidirEscrituraEnProduccion({
      host: new URL(entorno.DATABASE_URL).host,
      hostProduccion: entorno.NEON_ENDPOINT_PRODUCCION,
      confirmacion: entorno.CONFIRMAR_PRODUCCION,
      esperada: confirmacionEsperada,
      bandera: interpretarBandera(entorno.PERMITIR_ESCRITURA_PRODUCCION),
    });
    if (!decision.ok) throw new Error(decision.motivo);
    return { escribe: true, destino: "produccion" };
  }

  await exigirRamaDeDesarrollo(cliente, entorno);
  return { escribe: true, destino: "desarrollo" };
}

export function decidirSiPuedeEscribir({
  host,
  hostEsperado,
  hostProduccion,
  rama,
  ramaEsperada,
}) {
  const endpoint = decidirEndpointSeguro({ host, hostEsperado, hostProduccion, ramaEsperada });
  if (!endpoint.ok) return endpoint;

  if (rama !== ramaEsperada) {
    return {
      ok: false,
      motivo: `La base dice ser la rama «${rama ?? "sin marcar"}», no «${ramaEsperada}».`,
    };
  }

  return { ok: true };
}

function configuracion(entorno = process.env) {
  const connectionString = entorno.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL.");

  return {
    host: new URL(connectionString).host,
    hostEsperado: entorno.NEON_ENDPOINT_ESPERADO,
    hostProduccion: entorno.NEON_ENDPOINT_PRODUCCION,
    ramaEsperada: entorno.NEON_RAMA_ESPERADA,
  };
}

async function leerRama(cliente) {
  const { rows } = await cliente.query(
    "select valor from app_settings where clave = $1",
    [CLAVE_RAMA],
  );
  return rows[0]?.valor ?? null;
}

export async function exigirRamaDeDesarrollo(cliente, entorno = process.env) {
  const config = configuracion(entorno);
  const rama = await leerRama(cliente);
  const decision = decidirSiPuedeEscribir({ ...config, rama });
  if (!decision.ok) throw new Error(decision.motivo);
}

export async function sellarRamaDeDesarrollo(cliente, entorno = process.env) {
  const config = configuracion(entorno);
  const endpoint = decidirEndpointSeguro(config);
  if (!endpoint.ok) throw new Error(endpoint.motivo);

  await cliente.query("begin");
  try {
    await cliente.query("select pg_advisory_xact_lock($1)", [BLOQUEO_SELLADO]);
    const ramaActual = await leerRama(cliente);

    if (ramaActual !== null && ramaActual !== config.ramaEsperada) {
      throw new Error(
        `La base ya está marcada como «${ramaActual}»; no se sobrescribirá el marcador.`,
      );
    }

    if (ramaActual === null) {
      await cliente.query(
        `insert into app_settings (clave, valor, actualizado_por)
         values ($1, $2, 'catalogo-relacional-fase-b')`,
        [CLAVE_RAMA, config.ramaEsperada],
      );
    }

    await cliente.query("commit");
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }

  await exigirRamaDeDesarrollo(cliente, entorno);
}

async function ejecutarDesdeTerminal() {
  const [accion, ramaSolicitada] = process.argv.slice(2);
  if (accion !== "--sellar" || !ramaSolicitada) {
    throw new Error("Uso: node scripts/guarda-neon.mjs --sellar <rama>");
  }
  if (ramaSolicitada !== process.env.NEON_RAMA_ESPERADA) {
    throw new Error("La rama solicitada no coincide con NEON_RAMA_ESPERADA.");
  }

  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    await sellarRamaDeDesarrollo(cliente);
    console.log(`Rama de desarrollo sellada: ${ramaSolicitada}.`);
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
