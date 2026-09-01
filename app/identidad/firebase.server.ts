import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * La única puerta a `firebase-admin` en todo el proyecto.
 *
 * Es la misma regla que protege el controlador de Neon en `app/lib/datos`, y
 * por la misma razón: cuando la dependencia entra por un solo sitio, cambiarla
 * o simularla en pruebas es un trabajo acotado.
 * `tests/identidad-frontera.test.ts` lo vigila.
 *
 * La inicialización es perezosa: sin credenciales, el sitio tiene que arrancar
 * igual, como ya hacen el catálogo y `/api/leads`.
 */

export type IdentidadVerificada = {
  uid: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  proveedor: string;
};

function credenciales() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // La clave privada viaja con "\n" escapados en las variables de entorno.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Faltan las credenciales de servicio de Firebase.");
  }

  return { projectId, clientEmail, privateKey };
}

let app: App | null = null;

function obtenerApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ credential: cert(credenciales()) });
  }
  return app;
}

const auth = () => getAuth(obtenerApp());

/** El proveedor con el que se autenticó esta vez, o "desconocido". */
function proveedorDe(claims: Record<string, unknown>): string {
  const firebase = claims.firebase as { sign_in_provider?: string } | undefined;
  return firebase?.sign_in_provider ?? "desconocido";
}

function aIdentidad(claims: Record<string, unknown>): IdentidadVerificada {
  return {
    uid: String(claims.uid ?? claims.sub ?? ""),
    email: String(claims.email ?? ""),
    emailVerificado: claims.email_verified === true,
    nombre: String(claims.name ?? ""),
    proveedor: proveedorDe(claims),
  };
}

export async function verificarIdToken(idToken: string): Promise<IdentidadVerificada> {
  // `true` comprueba que la cuenta no esté deshabilitada ni la sesión revocada.
  const claims = await auth().verifyIdToken(idToken, true);
  return aIdentidad(claims as unknown as Record<string, unknown>);
}

export async function crearCookieDeSesion(idToken: string, msDuracion: number) {
  return auth().createSessionCookie(idToken, { expiresIn: msDuracion });
}

export async function verificarCookieDeSesion(cookie: string): Promise<IdentidadVerificada> {
  const claims = await auth().verifySessionCookie(cookie, true);
  return aIdentidad(claims as unknown as Record<string, unknown>);
}

/**
 * Revoca las sesiones y borra la identidad. En este orden: si se borrara
 * primero, una sesión viva podría seguir usándose durante su último minuto.
 */
export async function revocarYBorrarUsuario(uid: string): Promise<void> {
  await auth().revokeRefreshTokens(uid);
  await auth().deleteUser(uid);
}
