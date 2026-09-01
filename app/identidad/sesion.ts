/**
 * La política de la sesión del cliente. Módulo puro: sin cookies, sin red y
 * sin `server-only`, para poder probarlo con `node:test`.
 *
 * Nada de aquí toca la sesión del panel, que vive en `app/admin/auth` y usa
 * otra cookie, otro ámbito y otro mecanismo.
 */

export const COOKIE_SESION_CLIENTE = "econoluz_cliente";

/** Cinco días, decidido con el dueño el 01/09/2026. */
export const DIAS_DE_SESION = 5;
export const MS_DE_SESION = DIAS_DE_SESION * 24 * 60 * 60 * 1000;

export type OpcionesDeCookie = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
};

export function normalizarCorreo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

export function caducidadDesde(ahora: Date): Date {
  return new Date(ahora.getTime() + MS_DE_SESION);
}

/**
 * `sameSite: "lax"` y no `"strict"`: al volver del redirigido de Google, una
 * cookie estricta no viajaría y la sesión parecería no existir.
 *
 * `path: "/"` porque el cliente navega por todo el sitio, a diferencia del
 * panel, cuya cookie se limita a `/admin`.
 */
export function opcionesDeCookie(expira: Date, produccion: boolean): OpcionesDeCookie {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: produccion,
    path: "/",
    expires: expira,
  };
}

/**
 * Se renueva pasada la mitad de la vida: así el uso normal mantiene la sesión
 * viva sin renovarla en cada carga. Una sesión ya caducada no se renueva
 * —se rehace entrando—, que es lo que impide alargar indefinidamente una
 * sesión abandonada.
 */
export function debeRenovarse(expira: Date, ahora: Date): boolean {
  const restante = expira.getTime() - ahora.getTime();
  return restante > 0 && restante < MS_DE_SESION / 2;
}

export type EstadoDeSesion =
  | { estado: "sin-sesion" }
  | { estado: "invalida" }
  | { estado: "indisponible" }
  | { estado: "valida" };

export type FalloDeSesion = "invalida" | "indisponible";

/**
 * Distingue navegación anónima, una credencial inválida y un fallo operativo.
 * Solo la credencial inválida debe sacar al visitante.
 */
export function interpretarSesion(entrada: {
  hayCookie: boolean;
  verificada: boolean;
  fallo: FalloDeSesion | null;
}): EstadoDeSesion {
  if (!entrada.hayCookie) return { estado: "sin-sesion" };
  if (entrada.verificada) return { estado: "valida" };
  return { estado: entrada.fallo === "indisponible" ? "indisponible" : "invalida" };
}

const CODIGOS_DE_SESION_INVALIDA = new Set([
  "auth/argument-error",
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

/** Un error de Firebase no implica necesariamente que la cookie sea inválida. */
export function clasificarFalloDeSesion(fallo: unknown): FalloDeSesion {
  const codigo =
    typeof fallo === "object" && fallo !== null && "code" in fallo
      ? (fallo as { code?: unknown }).code
      : null;

  return typeof codigo === "string" && CODIGOS_DE_SESION_INVALIDA.has(codigo)
    ? "invalida"
    : "indisponible";
}
