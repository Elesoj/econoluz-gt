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

export type ConfiguracionFederada = {
  type: "external_account";
  audience: string;
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt";
  token_url: "https://sts.googleapis.com/v1/token";
  service_account_impersonation_url: string;
};

/**
 * Las dos audiencias del camino federado, que **no se escriben igual**.
 *
 * Google publica la audiencia predeterminada del proveedor como una URL con `https://`, y
 * esa es la que hay que pedirle a Vercel: acaba en la afirmación `aud` del testigo. Pero
 * el Security Token Service exige en su propio campo `audience` el **nombre de recurso**,
 * que empieza por `//`. Pasarle la URL responde:
 *
 * > Invalid value for "audience". This value should be the full resource name of the
 * > Identity Provider.
 *
 * Comprobado contra el STS el 01/09/2026. Los dos ejemplos de la documentación de Vercel
 * escriben este campo de forma distinta, y por eso `GCP_AUDIENCE` se admite en cualquiera
 * de las dos formas y aquí se normaliza a la que toca en cada sitio.
 */
function recursoDelProveedor(env: Record<string, string | undefined>): string {
  return (env.GCP_AUDIENCE as string).replace(/^https:/, "");
}

/** La que se le pide a Vercel, con `https://`. */
export function audienciaDelTestigo(env: Record<string, string | undefined>): string {
  const recurso = recursoDelProveedor(env);
  return `https:${recurso}`;
}

/**
 * Lo que se le pasa a `ExternalAccountClient.fromJSON`, sin el proveedor del testigo, que
 * es lo único impuro y vive en `credencialFederada.server.ts`.
 */
export function configuracionFederada(
  env: Record<string, string | undefined>,
): ConfiguracionFederada {
  if (elegirModo(env) !== "federada") {
    throw new Error("configuracionFederada solo se usa cuando el modo es federada.");
  }

  return {
    type: "external_account",
    audience: recursoDelProveedor(env),
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  };
}

export type ClienteFederado = {
  getAccessToken(): Promise<{ token?: string | null }>;
  credentials: { expiry_date?: number | null };
};

/**
 * La forma que `initializeApp` espera de una credencial. **No se importa de
 * `firebase-admin` a propósito**, ni siquiera como tipo: la frontera del proyecto reserva
 * ese import para `firebase.server.ts`, y esto es todo lo que el SDK necesita.
 */
export type CredencialDeFirebase = {
  getAccessToken(): Promise<{ access_token: string; expires_in: number }>;
};

/**
 * Convierte cualquier cliente de cuenta externa en la credencial que espera
 * `firebase-admin`. El cliente se recibe como función para poder construirlo tarde —y
 * una sola vez—, y para poder inyectar uno falso en las pruebas.
 */
export function adaptarCredencial(
  crearCliente: () => ClienteFederado,
  ahora: () => number = Date.now,
): CredencialDeFirebase {
  let cliente: ClienteFederado | null = null;

  return {
    async getAccessToken() {
      cliente ??= crearCliente();

      const { token } = await cliente.getAccessToken();
      if (!token) {
        throw new Error("El intercambio federado no devolvió ningún testigo de acceso.");
      }

      const caducidad = cliente.credentials.expiry_date;
      if (typeof caducidad !== "number") {
        throw new Error(
          "El intercambio federado no devolvió caducidad del testigo de acceso; sin ella no " +
            "se puede saber cuánto vale.",
        );
      }

      return {
        access_token: token,
        expires_in: Math.max(0, Math.floor((caducidad - ahora()) / 1000)),
      };
    },
  };
}
