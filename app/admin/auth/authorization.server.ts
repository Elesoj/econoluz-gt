import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hashSessionToken } from "./crypto";
import { puedeEscribirEnvios } from "./permisos";
import { getSessionCookieOptions } from "./policy";
import { getAdminAuthRepository } from "./repository.server";
import {
  renewSessionToken,
  validateSessionToken,
  type SessionUser,
  type SessionValidation,
} from "./session";
import type { RolAdmin } from "./types";

export const ADMIN_SESSION_COOKIE = "econoluz_admin";
export const RUTA_ENTRAR = "/admin/entrar";

function esProduccion() {
  return process.env.NODE_ENV === "production";
}

/**
 * El secreto no tiene valor por defecto a propósito: sin él, las huellas de
 * sesión serían predecibles y el panel parecería funcionar igual.
 */
export function obtenerSecretoSesion() {
  const secreto = process.env.ADMIN_SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error(
      "Falta ADMIN_SESSION_SECRET o es demasiado corto. Genéralo con: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return secreto;
}

async function leerToken() {
  const almacen = await cookies();
  return almacen.get(ADMIN_SESSION_COOKIE)?.value ?? "";
}

/**
 * Lectura memoizada durante un render: varias páginas y componentes pueden
 * preguntar por la sesión sin que eso signifique varias consultas a Neon.
 * Sin cookie no se consulta la base de datos.
 */
export const leerSesion = cache(async (): Promise<SessionValidation> => {
  const token = await leerToken();
  if (!token) {
    return { status: "invalid" };
  }

  return validateSessionToken(token, getAdminAuthRepository(), new Date(), obtenerSecretoSesion());
});

/**
 * La frontera real del panel. Toda página protegida la llama antes de leer
 * nada: el layout no sirve como guardia porque no se vuelve a renderizar al
 * navegar entre rutas.
 */
export async function verificarSesion(): Promise<SessionUser> {
  const sesion = await leerSesion();
  if (sesion.status !== "valid") {
    redirect(RUTA_ENTRAR);
  }
  return sesion.user;
}

/**
 * Variante para Server Actions: vuelve a comprobar la sesión junto a la
 * escritura —no confía en lo que comprobó el layout hace media hora— y
 * aprovecha para alargarla si toca.
 */
export async function verificarSesionParaAccion(): Promise<SessionUser> {
  const token = await leerToken();
  if (!token) {
    redirect(RUTA_ENTRAR);
  }

  const resultado = await renewSessionToken(
    token,
    getAdminAuthRepository(),
    new Date(),
    obtenerSecretoSesion(),
  );

  if (resultado.status !== "valid") {
    redirect(RUTA_ENTRAR);
  }

  if (resultado.renewed) {
    await crearCookieSesion(token, resultado.expiresAt);
  }

  return resultado.user;
}

export async function leerRolDeLaBase(userId: string): Promise<RolAdmin> {
  const repositorio = getAdminAuthRepository();
  const rol = await repositorio.findRoleByUserId(userId);
  if (!rol) {
    redirect(RUTA_ENTRAR);
  }
  return rol;
}

/**
 * El rol se relee de admin_users en cada acción: nunca se toma de la cookie ni
 * del formulario, y así un cambio de rol surte efecto sobre sesiones abiertas.
 */
export async function verificarPermisoParaAccion(
  permiso: "envios:escribir",
): Promise<SessionUser & { rol: RolAdmin }> {
  const usuario = await verificarSesionParaAccion();
  const rol = await leerRolDeLaBase(usuario.id);
  if (permiso === "envios:escribir" && !puedeEscribirEnvios(rol)) {
    redirect("/admin?error=sin-permiso");
  }
  return { ...usuario, rol };
}

/** Escribe la cookie de sesión. Solo desde Server Actions o Route Handlers. */
export async function crearCookieSesion(token: string, expiresAt: Date) {
  const almacen = await cookies();
  almacen.set(ADMIN_SESSION_COOKIE, token, getSessionCookieOptions(expiresAt, esProduccion()));
}

/**
 * Cierra la sesión actual. Borra la fila antes que la cookie: si solo se
 * quitara la cookie, el token seguiría sirviendo a quien lo hubiera copiado.
 */
export async function revocarSesionActual() {
  const almacen = await cookies();
  const token = almacen.get(ADMIN_SESSION_COOKIE)?.value;

  if (token) {
    try {
      const repositorio = getAdminAuthRepository();
      await repositorio.deleteSession(hashSessionToken(token, obtenerSecretoSesion()));
    } catch {
      // Aunque Neon no conteste, la cookie se retira igual: el navegador deja
      // de presentar el token y la fila caduca sola a las doce horas.
    }
  }

  almacen.set(ADMIN_SESSION_COOKIE, "", {
    ...getSessionCookieOptions(new Date(0), esProduccion()),
    maxAge: 0,
  });
}
