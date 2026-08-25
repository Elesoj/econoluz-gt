import { randomBytes } from "node:crypto";
import {
  createSessionToken,
  hashLoginAttemptKey,
  hashSessionToken,
  verifyPassword,
} from "./crypto";
import { getSessionExpiry, validateLoginInput } from "./policy";
import type { AdminAuthRepository, AdminLoginAttempt } from "./types";

/** Cinco fallos dentro de la ventana bloquean el acceso. */
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export type LoginInput = {
  email?: unknown;
  password?: unknown;
  origin: string;
};

export type LoginResult =
  | { status: "success"; token: string; expiresAt: Date; userName: string }
  | { status: "invalid" }
  | { status: "blocked"; retryAt: Date }
  | { status: "unavailable" };

/**
 * Credencial señuelo para los correos desconocidos: sin ella, un correo que no
 * existe respondería mucho antes que uno que sí, y esa diferencia de tiempo
 * revela qué cuentas hay dadas de alta.
 */
const DECOY_SALT = randomBytes(16).toString("hex");
const DECOY_HASH = randomBytes(64).toString("hex");

/**
 * Un intento bloqueado se reconoce por su marca de bloqueo o por haber agotado
 * el límite dentro de la ventana. Mirar también el contador evita que una fila
 * con la marca sin rellenar abra la puerta a fuerza bruta.
 */
function getBlockedUntil(attempt: AdminLoginAttempt | null, now: Date): Date | null {
  if (!attempt) return null;
  if (attempt.blockedUntil && attempt.blockedUntil.getTime() > now.getTime()) {
    return attempt.blockedUntil;
  }
  if (attempt.failureCount >= LOGIN_FAILURE_LIMIT) {
    return attempt.blockedUntil ?? new Date(now.getTime() + LOGIN_FAILURE_WINDOW_MS);
  }
  return null;
}

/**
 * Comprueba unas credenciales y, si son correctas, deja creada la sesión.
 * No distingue nunca entre correo inexistente y contraseña equivocada: quien
 * prueba desde fuera recibe el mismo `invalid` en los dos casos.
 */
export async function loginAdmin(
  input: LoginInput,
  repository: AdminAuthRepository,
  now: Date,
  secret: string,
): Promise<LoginResult> {
  const validated = validateLoginInput(input);
  if (!validated.ok) {
    return { status: "invalid" };
  }

  const keyHash = hashLoginAttemptKey(validated.email, input.origin, secret);

  try {
    const blockedUntil = getBlockedUntil(
      await repository.findCurrentLoginAttempt(keyHash, now),
      now,
    );
    if (blockedUntil) {
      return { status: "blocked", retryAt: blockedUntil };
    }

    const user = await repository.findActiveUserByEmail(validated.email);
    const matches = user
      ? await verifyPassword(validated.password, user.salt, user.passwordHash)
      : await verifyPassword(validated.password, DECOY_SALT, DECOY_HASH);

    if (!user || !matches) {
      const attempt = await repository.recordLoginFailure(keyHash, now);
      const reachedLimit = getBlockedUntil(attempt, now);
      return reachedLimit ? { status: "blocked", retryAt: reachedLimit } : { status: "invalid" };
    }

    await repository.clearLoginAttempt(keyHash);

    const token = createSessionToken();
    const expiresAt = getSessionExpiry(now);
    await repository.createSessionForUser(user.id, hashSessionToken(token, secret), now, expiresAt);

    return { status: "success", token, expiresAt, userName: user.name };
  } catch {
    // El detalle del fallo se queda dentro: fuera solo se sabe que no se pudo atender.
    return { status: "unavailable" };
  }
}
