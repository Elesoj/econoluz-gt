import { cookies } from "next/headers";
import { aprovisionarCliente } from "@/app/identidad/aprovisionamiento.server";
import { demasiadosFallosRecientes, registrarEvento } from "@/app/identidad/eventos.server";
import {
  crearCookieDeSesion,
  revocarSesiones,
  verificarIdToken,
} from "@/app/identidad/firebase.server";
import { esMismoOrigen } from "@/app/identidad/origen";
import {
  COOKIE_SESION_CLIENTE,
  MS_DE_SESION,
  caducidadDesde,
  cerrarSesion,
  opcionesDeCookie,
} from "@/app/identidad/sesion";
import { leerClienteActual } from "@/app/identidad/sesion.server";
import { registrar } from "@/app/lib/datos";

// `firebase-admin` necesita runtime de Node: no funciona en edge.
export const runtime = "nodejs";

const esProduccion = () => process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  if (!esMismoOrigen(request.headers.get("origin"), request.headers.get("host"))) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");

  let idToken: unknown;
  try {
    idToken = (await request.json())?.idToken;
  } catch {
    idToken = undefined;
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return Response.json({ ok: false, error: "falta-token" }, { status: 400 });
  }

  if (await demasiadosFallosRecientes(ip)) {
    return Response.json({ ok: false, error: "demasiados-intentos" }, { status: 429 });
  }

  let identidad;
  try {
    identidad = await verificarIdToken(idToken);
  } catch {
    await registrarEvento({
      userId: null,
      tipo: "fallo",
      proveedor: null,
      resultado: "fallido",
      ip,
      userAgent,
    });
    return Response.json({ ok: false, error: "token-no-valido" }, { status: 401 });
  }

  const cliente = await aprovisionarCliente(identidad);
  const cookie = await crearCookieDeSesion(idToken, MS_DE_SESION);
  const expira = caducidadDesde(new Date());

  const almacen = await cookies();
  almacen.set(COOKIE_SESION_CLIENTE, cookie, opcionesDeCookie(expira, esProduccion()));

  await registrarEvento({
    userId: cliente.id,
    tipo: cliente.recienCreada ? "registro" : "acceso",
    proveedor: identidad.proveedor,
    resultado: "correcto",
    ip,
    userAgent,
  });

  return Response.json({ ok: true, recienCreada: cliente.recienCreada });
}

export async function DELETE(request: Request) {
  if (!esMismoOrigen(request.headers.get("origin"), request.headers.get("host"))) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const cliente = await leerClienteActual();

  // La orquestación —y qué pasa si Firebase no contesta— vive en `cerrarSesion`,
  // que está probada. Aquí solo se le dan las piezas de verdad.
  const { revocada } = await cerrarSesion({
    uid: cliente?.uid ?? null,
    revocar: revocarSesiones,
    borrarCookie: async () => {
      const almacen = await cookies();
      almacen.delete(COOKIE_SESION_CLIENTE);
    },
  });

  if (cliente && !revocada) {
    registrar("error", "identidad-sesion-no-revocada", {
      efecto: "la cookie se borro, pero la sesion sigue viva en Firebase hasta caducar",
    });
  }

  return Response.json({ ok: true });
}
