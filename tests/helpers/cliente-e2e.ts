// tests/helpers/cliente-e2e.ts
//
// Autenticación E2E **real** de clientes. No hay atajo, y conviene entender por qué.
//
// `app/identidad/sesion.ts` define `COOKIE_SESION_CLIENTE = "econoluz_cliente"`, y
// `leerSesionDeCliente` la entrega a `verificarCookieDeSesion`, que llama a
// `auth().verifySessionCookie(cookie, true)`. Es decir: solo vale una cookie de
// sesión emitida por Firebase, y además la cuenta tiene que existir en `users` con
// su `firebase_uid`. Una cookie inventada —un JSON en Base64, por ejemplo— no la
// acepta ninguna página real: la prueba que la usara estaría comprobando el atajo,
// no la aplicación.
//
// El único camino honesto es el del navegador de un cliente de verdad: obtener un
// ID token del emulador de Firebase Authentication y entregárselo a la frontera
// real, `POST /api/clientes/sesion`, que lo verifica, aprovisiona la fila de
// `users` y devuelve la cookie.

import type { BrowserContext } from "@playwright/test";
import { getE2ESql } from "./admin-e2e";
import { endpointCanonico } from "../../scripts/endpoint-canonico.mjs";

const BASE_URL = "http://127.0.0.1:3100";

export type ClienteE2E = {
  userId: string;
  uid: string;
  email: string;
  contrasena: string;
  nombre: string;
};

function leerVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta ${nombre}. Las pruebas E2E de clientes no tienen atajo: sin esta variable no se pueden autenticar de verdad.`,
    );
  }
  return valor;
}

/**
 * Rechaza Producción e **identifica positivamente** la rama de Neon.
 *
 * «No es Producción» no basta: un endpoint mal configurado podría apuntar a
 * cualquier otra rama con datos que importen, y estas pruebas escriben de verdad.
 * El marcador `rama_neon` de `app_settings` lo escribe
 * `scripts/guarda-neon.mjs --sellar` y es la única prueba positiva de contra qué
 * base se está trabajando.
 */
export function exigirBaseE2EAislada(): void {
  const dbUrl = leerVariable("DATABASE_URL");
  const ramaEsperada = leerVariable("NEON_RAMA_E2E");
  const endpointProduccion = leerVariable("NEON_ENDPOINT_PRODUCCION");

  const conectado = endpointCanonico(new URL(dbUrl).hostname);
  if (conectado === endpointCanonico(endpointProduccion)) {
    throw new Error(
      `PROHIBIDO: las pruebas E2E escriben, y el endpoint ${conectado} es el de Producción.`,
    );
  }

  if (!ramaEsperada.trim()) {
    throw new Error("NEON_RAMA_E2E está vacía.");
  }
}

/** Comprueba contra la base que la rama conectada es la esperada. */
export async function exigirRamaE2E(): Promise<void> {
  const ramaEsperada = leerVariable("NEON_RAMA_E2E");
  const sql = getE2ESql();
  const filas = await sql`SELECT valor FROM app_settings WHERE clave = 'rama_neon'`;
  const rama = filas[0]?.valor ?? null;
  if (rama !== ramaEsperada) {
    throw new Error(
      `La base dice ser la rama «${rama ?? "sin marcar"}» y se esperaba «${ramaEsperada}». Séllala con: node scripts/guarda-neon.mjs --sellar ${ramaEsperada}`,
    );
  }
}

export function exigirEmuladorFirebase(): {
  emulador: string;
  apiKey: string;
  proyecto: string;
} {
  return {
    emulador: leerVariable("FIREBASE_AUTH_EMULATOR_HOST"),
    apiKey: leerVariable("E2E_FIREBASE_API_KEY"),
    proyecto: leerVariable("FIREBASE_PROJECT_ID"),
  };
}

type RespuestaIdentityToolkit = {
  idToken?: string;
  localId?: string;
  error?: { message?: string };
};

/**
 * `firebase-admin` reconoce el emulador por `FIREBASE_AUTH_EMULATOR_HOST` y
 * construye contra él la URL
 * `http://{host}/identitytoolkit.googleapis.com/{version}/projects/{projectId}{api}`
 * —se puede leer en `node_modules/firebase-admin/lib/auth/auth-api-request.js`—.
 * Ese mismo prefijo expone la API REST de cliente, que es la que se usa aquí para
 * crear el usuario y pedir su ID token.
 */
async function llamarIdentityToolkit(
  metodo: "accounts:signUp" | "accounts:signInWithPassword",
  cuerpo: Record<string, unknown>,
): Promise<{ idToken: string; localId: string }> {
  const { emulador, apiKey } = exigirEmuladorFirebase();
  const url = `http://${emulador}/identitytoolkit.googleapis.com/v1/${metodo}?key=${apiKey}`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cuerpo, returnSecureToken: true }),
  });

  const json = (await respuesta.json()) as RespuestaIdentityToolkit;
  if (!respuesta.ok || !json.idToken || !json.localId) {
    throw new Error(
      `El emulador de Firebase rechazó ${metodo}: HTTP ${respuesta.status} ${json.error?.message ?? ""}`.trim(),
    );
  }
  return { idToken: json.idToken, localId: json.localId };
}

/**
 * Canjea un ID token por la cookie de sesión **por la frontera real de la
 * aplicación**, que es la que verifica el token, aprovisiona `users` por
 * `firebase_uid` y emite la cookie con `crearCookieDeSesion`.
 *
 * La cabecera `Origin` es obligatoria: `esMismoOrigen` rechaza la petición sin ella.
 */
async function canjearSesion(context: BrowserContext, idToken: string): Promise<void> {
  const respuesta = await context.request.post(`${BASE_URL}/api/clientes/sesion`, {
    headers: { Origin: BASE_URL, "Content-Type": "application/json" },
    data: { idToken },
  });

  if (!respuesta.ok()) {
    throw new Error(`El canje de sesión falló: HTTP ${respuesta.status()} ${await respuesta.text()}`);
  }
}

async function leerUserIdPorUid(uid: string): Promise<string> {
  const sql = getE2ESql();
  const filas = await sql`SELECT id FROM users WHERE firebase_uid = ${uid}`;
  if (filas.length !== 1) {
    throw new Error(`El canje de sesión no dejó exactamente una fila en users para el uid ${uid}.`);
  }
  return String(filas[0].id);
}

/**
 * Crea un cliente auténtico en el emulador, lo autentica contra la aplicación y
 * devuelve sus datos, incluido el `users.id` que aprovisionó la propia aplicación.
 */
export async function aprovisionarClienteE2E(
  context: BrowserContext,
  sufijo: string,
): Promise<ClienteE2E> {
  const marca = `${sufijo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-cliente-${marca}@econoluz.test`;
  const contrasena = `Prueba-${marca}`;
  const nombre = `Cliente E2E ${sufijo}`;

  const { idToken, localId } = await llamarIdentityToolkit("accounts:signUp", {
    email,
    password: contrasena,
  });
  await canjearSesion(context, idToken);

  const userId = await leerUserIdPorUid(localId);

  // El nombre lo escribe el aprovisionamiento a partir del token, que en el
  // emulador no trae `name`. Se completa aquí para que la interfaz tenga algo
  // que mostrar.
  const sql = getE2ESql();
  await sql`UPDATE users SET nombre = ${nombre} WHERE id = ${userId}`;

  return { userId, uid: localId, email, contrasena, nombre };
}

/** Autentica un contexto nuevo con un cliente ya creado, por el mismo camino real. */
export async function autenticarComoCliente(
  context: BrowserContext,
  cliente: ClienteE2E,
): Promise<void> {
  const { idToken } = await llamarIdentityToolkit("accounts:signInWithPassword", {
    email: cliente.email,
    password: cliente.contrasena,
  });
  await canjearSesion(context, idToken);
}

/**
 * Limpieza completa de un cliente de prueba, en orden de dependencias.
 *
 * **Propaga los errores.** Una limpieza silenciosa deja fixtures vivos que rompen
 * la siguiente ejecución en otro sitio y por un motivo que ya no se relaciona con
 * esta prueba.
 */
export async function limpiarClienteE2E(userId: string): Promise<void> {
  const sql = getE2ESql();
  await sql`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ${userId})`;
  await sql`DELETE FROM carts WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_addresses WHERE user_id = ${userId}`;
  await sql`DELETE FROM auth_events WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_consents WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
}
