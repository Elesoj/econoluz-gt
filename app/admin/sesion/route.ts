import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  crearCookieSesion,
} from "../auth/authorization.server";
import { getAdminAuthRepository } from "../auth/repository.server";
import { renewSessionToken } from "../auth/session";

/**
 * Renovación por actividad real del panel. No devuelve identidad ni caducidad:
 * solo dice si la sesión sigue en pie, para que nada de esto acabe accesible
 * desde el JavaScript del navegador.
 */
export async function POST() {
  const almacen = await cookies();
  const token = almacen.get(ADMIN_SESSION_COOKIE)?.value ?? "";

  if (!token) {
    return new Response(null, { status: 401 });
  }

  let resultado;
  try {
    const secreto = process.env.ADMIN_SESSION_SECRET;
    if (!secreto || secreto.length < 32) {
      return new Response(null, { status: 503 });
    }
    resultado = await renewSessionToken(token, getAdminAuthRepository(), new Date(), secreto);
  } catch {
    return new Response(null, { status: 503 });
  }

  if (resultado.status === "unavailable") {
    return new Response(null, { status: 503 });
  }

  if (resultado.status !== "valid") {
    return new Response(null, { status: 401 });
  }

  if (resultado.renewed) {
    await crearCookieSesion(token, resultado.expiresAt);
  }

  return new Response(null, { status: 204 });
}
