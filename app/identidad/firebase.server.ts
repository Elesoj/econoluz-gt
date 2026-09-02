import "server-only";

import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { elegirModo } from "./credencial";
import { credencialFederada } from "./credencialFederada.server";

/**
 * La única puerta a `firebase-admin` en todo el proyecto.
 *
 * Es la misma regla que protege el controlador de Neon en `app/lib/datos`, y
 * por la misma razón: cuando la dependencia entra por un solo sitio, cambiarla
 * o simularla en pruebas es un trabajo acotado.
 * `tests/identidad-frontera.test.ts` lo vigila.
 *
 * ## Cómo se autentica, y por qué así
 *
 * **No hay ninguna clave privada de cuenta de servicio, ni la habrá.** La
 * organización `econoluz.net` prohíbe generarlas por política, y esa política
 * es correcta: una clave descargada es un secreto permanente que se copia, se
 * pega en un chat y sobrevive a quien la creó.
 *
 * Hay dos caminos, y cuál se usa lo decide `elegirModo` en `credencial.ts`:
 *
 * - **En desarrollo local**, las **credenciales predeterminadas de la
 *   aplicación** (ADC) que deja `gcloud auth application-default login`. Viven
 *   en el perfil del usuario, **nunca dentro del repositorio**.
 * - **En Vercel**, una **identidad federada**: Vercel firma un testigo OIDC por
 *   despliegue, Google lo canjea por credenciales temporales mediante Workload
 *   Identity Federation y con ellas se suplanta una cuenta de servicio con
 *   cuatro permisos sobre Firebase Authentication. Ver
 *   `docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md`.
 *
 * **En Vercel no hay respaldo hacia ADC.** Si falta configuración se lanza un
 * error: caer hacia el camino más privilegiado justo cuando algo está mal
 * configurado es precisamente lo que no puede pasar.
 *
 * La inicialización es perezosa: sin credenciales, el sitio tiene que arrancar
 * igual, como ya hacen el catálogo y `/api/leads`. Y falla de forma segura: si
 * falta el proyecto o no hay credenciales, se lanza un error claro en vez de
 * seguir a medias.
 */

export type IdentidadVerificada = {
  uid: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  proveedor: string;
};

/**
 * El proyecto no se deduce ni se adivina: sin él, `firebase-admin` podría
 * apuntar a un proyecto distinto del previsto y verificar tokens que no son
 * nuestros.
 */
function proyecto(): string {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Falta FIREBASE_PROJECT_ID. En local, ponlo en .env.local y autentícate con " +
        "gcloud auth application-default login. Ver docs/OPERACION-FIREBASE.md.",
    );
  }
  return projectId;
}

let credencial: Credential | null = null;
let app: App | null = null;

function obtenerCredencial(): Credential {
  if (!credencial) {
    credencial =
      elegirModo(process.env) === "federada"
        ? (credencialFederada() as Credential)
        : applicationDefault();
  }
  return credencial;
}

function obtenerApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ credential: obtenerCredencial(), projectId: proyecto() });
  }
  return app;
}

const auth = () => getAuth(obtenerApp());

/**
 * Comprueba que las credenciales de verdad funcionan.
 *
 * `applicationDefault()` no falla al crearse: resuelve las credenciales
 * perezosamente, así que un entorno sin ADC parecería estar bien hasta la
 * primera operación real. Pedir un testigo de acceso es la única forma de
 * saberlo antes. **No devuelve el testigo**, solo cuánto le queda de vida.
 */
export async function comprobarCredenciales(): Promise<{
  projectId: string;
  segundosDeVida: number;
}> {
  const projectId = proyecto();
  const testigo = await obtenerCredencial().getAccessToken();
  return { projectId, segundosDeVida: testigo.expires_in };
}

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
