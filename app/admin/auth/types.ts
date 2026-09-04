/**
 * Los dos roles del panel. `empleado` existe en la restricción de la base desde
 * la migración 014, pero durante el subproyecto 9A `npm run admin:crear` rechaza
 * crear cuentas con ese rol: las Server Actions de productos y proyectos siguen
 * comprobando solo que exista sesión, así que una cuenta "limitada" tendría esas
 * acciones abiertas igual que una administradora.
 */
export const ROLES = ["administrador", "empleado"] as const;
export type RolAdmin = (typeof ROLES)[number];

/** Valida que un valor cualquiera sea uno de los dos roles admitidos, nada más. */
export function validarRol(valor: unknown): { ok: true; rol: RolAdmin } | { ok: false } {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor)
    ? { ok: true, rol: valor as RolAdmin }
    : { ok: false };
}

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  rol: RolAdmin;
};

export type AdminSession = {
  userId: string;
  userName: string;
  expiresAt: Date;
};

export type AdminLoginAttempt = {
  failureCount: number;
  blockedUntil: Date | null;
};

export type UpsertAdminUserInput = {
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  now: Date;
  /**
   * Sin valor por defecto a propósito: quien llama a `upsertAdminUser` tiene
   * que decidir el rol en cada punto de llamada. Ver la cabecera de
   * `db/014_roles_admin.sql`.
   */
  rol: RolAdmin;
};

export type AdminAuthRepository = {
  findActiveUserByEmail(email: string): Promise<AdminUser | null>;
  createSessionForUser(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<void>;
  findValidSession(tokenHash: string, now: Date): Promise<AdminSession | null>;
  renewSession(tokenHash: string, expiresAt: Date, now: Date): Promise<boolean>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  findCurrentLoginAttempt(keyHash: string, now: Date): Promise<AdminLoginAttempt | null>;
  recordLoginFailure(keyHash: string, now: Date): Promise<AdminLoginAttempt>;
  clearLoginAttempt(keyHash: string): Promise<void>;
  deleteExpiredData(now: Date): Promise<{ deletedSessions: number; deletedAttempts: number }>;
  upsertAdminUser(input: UpsertAdminUserInput): Promise<void>;
};

export type AdminAuthQuery = (
  text: string,
  params: readonly (string | number | boolean | null)[],
) => Promise<Record<string, unknown>[]>;
