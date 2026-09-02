/**
 * La regla de qué credencial usa el servidor para hablar con Firebase, y nada más.
 *
 * Vive aparte de `firebase.server.ts` por la misma razón que `sesion.ts` vive aparte de
 * `sesion.server.ts`: lo que se puede probar sin red ni credenciales, se prueba. Un
 * módulo con `server-only` no se puede importar desde `node --test`, así que la lógica
 * que importa no puede vivir dentro de él.
 */

export type ModoDeCredencial = "adc" | "federada";

/**
 * Ninguna es secreta: son identificadores públicos del proyecto de Google. Sin un
 * testigo OIDC firmado por Vercel para el equipo, el proyecto y el entorno correctos,
 * quien las tenga no obtiene nada con ellas.
 */
export const VARIABLES_DE_FEDERACION = [
  "GCP_PROJECT_NUMBER",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "GCP_AUDIENCE",
] as const;

/**
 * En Vercel **no hay respaldo**. Si falta configuración, se lanza: caer hacia
 * `applicationDefault()` sería tomar el camino más privilegiado precisamente cuando algo
 * está mal configurado, y nadie se enteraría. Es la misma regla que gobierna
 * `app/data/origenPublico.ts` con el rol público de Neon.
 */
export function elegirModo(env: Record<string, string | undefined>): ModoDeCredencial {
  if (!env.VERCEL) {
    return "adc";
  }

  const faltan = VARIABLES_DE_FEDERACION.filter((variable) => !env[variable]);
  if (faltan.length > 0) {
    throw new Error(
      "En Vercel la identidad de clientes se autentica con credenciales federadas y no hay " +
        `respaldo posible. Faltan: ${faltan.join(", ")}. ` +
        "Ver docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md, sección 7.",
    );
  }

  return "federada";
}
