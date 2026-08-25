"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  crearCookieSesion,
  obtenerSecretoSesion,
  revocarSesionActual,
  RUTA_ENTRAR,
} from "./auth/authorization.server";
import { loginAdmin } from "./auth/login";
import { getAdminAuthRepository } from "./auth/repository.server";

/**
 * Lo único que vuelve al navegador tras un intento de acceso. Nunca lleva
 * token, ni sal, ni hash, ni indicio de si el correo existe.
 */
export type EstadoAcceso = {
  status: "inicial" | "invalid" | "blocked" | "unavailable";
  email: string;
};

/**
 * El origen forma parte de la clave anónima de intentos, junto al correo.
 * Detrás de Vercel la IP real llega en `x-forwarded-for`.
 */
async function obtenerOrigen() {
  const cabeceras = await headers();
  const reenviado = cabeceras.get("x-forwarded-for") ?? "";
  return reenviado.split(",")[0]?.trim() || "origen-desconocido";
}

export async function entrar(_estado: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  const email = String(datos.get("email") ?? "");
  const password = String(datos.get("password") ?? "");

  let resultado;
  try {
    resultado = await loginAdmin(
      { email, password, origin: await obtenerOrigen() },
      getAdminAuthRepository(),
      new Date(),
      obtenerSecretoSesion(),
    );
  } catch {
    // Falta de configuración o base de datos caída: ni se confirma ni se
    // desmiente nada sobre las credenciales.
    return { status: "unavailable", email };
  }

  if (resultado.status !== "success") {
    return { status: resultado.status, email };
  }

  await crearCookieSesion(resultado.token, resultado.expiresAt);

  // `redirect` lanza para interrumpir el render: fuera de cualquier try/catch.
  redirect("/admin");
}

/**
 * Cierra la sesión. No exige sesión válida antes: esta acción solo puede
 * destruir la sesión de quien manda la cookie, así que pedir autorización
 * para ello no protege de nada y sí complica el caso de una sesión ya rota.
 */
export async function salir() {
  await revocarSesionActual();
  redirect(RUTA_ENTRAR);
}
