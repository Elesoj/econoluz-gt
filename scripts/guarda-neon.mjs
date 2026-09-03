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
