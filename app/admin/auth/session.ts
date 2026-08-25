import { hashSessionToken } from "./crypto";
import { getSessionExpiry, shouldRenewSession } from "./policy";
import type { AdminAuthRepository } from "./types";

/** Lo único de la sesión que puede salir de aquí: quién es, nada más. */
export type SessionUser = {
  id: string;
  name: string;
};

export type SessionValidation =
  | { status: "valid"; user: SessionUser; expiresAt: Date }
  | { status: "invalid" }
  | { status: "unavailable" };

export type SessionRenewal =
  | { status: "valid"; renewed: boolean; user: SessionUser; expiresAt: Date }
  | { status: "invalid" }
  | { status: "unavailable" };

/**
 * Comprueba el token de la cookie contra Neon. Un token inválido y una base de
 * datos que no responde son cosas distintas: la primera saca al visitante, la
 * segunda es un fallo del servicio, y confundirlas cerraría la sesión de todos
 * cada vez que Neon tosa.
 */
export async function validateSessionToken(
  token: string,
  repository: AdminAuthRepository,
  now: Date,
  secret: string,
): Promise<SessionValidation> {
  if (!token) {
    return { status: "invalid" };
  }

  try {
    const session = await repository.findValidSession(hashSessionToken(token, secret), now);
    if (!session) {
      return { status: "invalid" };
    }

    return {
      status: "valid",
      user: { id: session.userId, name: session.userName },
      expiresAt: session.expiresAt,
    };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Valida el token y, si hace falta, alarga su caducidad. Solo escribe cuando
 * quedan menos de doce horas menos quince minutos, para que administrar el
 * panel no suponga una escritura en Neon por cada carga de página.
 */
export async function renewSessionToken(
  token: string,
  repository: AdminAuthRepository,
  now: Date,
  secret: string,
): Promise<SessionRenewal> {
  if (!token) {
    return { status: "invalid" };
  }

  const tokenHash = hashSessionToken(token, secret);

  try {
    const session = await repository.findValidSession(tokenHash, now);
    if (!session) {
      // Si la fila existía pero ya venció, se retira aquí mismo.
      await repository.deleteSession(tokenHash);
      return { status: "invalid" };
    }

    const user = { id: session.userId, name: session.userName };
    if (!shouldRenewSession(session.expiresAt, now)) {
      return { status: "valid", renewed: false, user, expiresAt: session.expiresAt };
    }

    const expiresAt = getSessionExpiry(now);
    if (!(await repository.renewSession(tokenHash, expiresAt, now))) {
      return { status: "invalid" };
    }

    // Una renovación ocurre como mucho cada quince minutos: es el momento
    // barato para vaciar sesiones e intentos caducados de las tablas.
    await repository.deleteExpiredData(now);

    return { status: "valid", renewed: true, user, expiresAt };
  } catch {
    return { status: "unavailable" };
  }
}
