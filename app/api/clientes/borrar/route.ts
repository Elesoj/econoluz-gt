import { cookies } from "next/headers";
import { borrarCuenta } from "@/app/identidad/anonimizacion.server";
import { registrarEvento } from "@/app/identidad/eventos.server";
import { verificarIdToken } from "@/app/identidad/firebase.server";
import { esMismoOrigen } from "@/app/identidad/origen";
import { COOKIE_SESION_CLIENTE } from "@/app/identidad/sesion";
import { leerClienteActual } from "@/app/identidad/sesion.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!esMismoOrigen(request.headers.get("origin"), request.headers.get("host"))) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const cliente = await leerClienteActual();
  if (!cliente) {
    return Response.json({ ok: false, error: "sin-sesion" }, { status: 401 });
  }

  let idToken: unknown;
  try {
    idToken = (await request.json())?.idToken;
  } catch {
    idToken = undefined;
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return Response.json({ ok: false, error: "falta-reautenticacion" }, { status: 400 });
  }

  const recien = await verificarIdToken(idToken).catch(() => null);
  if (!recien || recien.uid !== cliente.uid) {
    return Response.json({ ok: false, error: "reautenticacion-no-valida" }, { status: 401 });
  }

  await registrarEvento({
    userId: cliente.id,
    tipo: "borrado",
    proveedor: recien.proveedor,
    resultado: "correcto",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  await borrarCuenta(cliente.id, cliente.uid);

  const almacen = await cookies();
  almacen.delete(COOKIE_SESION_CLIENTE);

  return Response.json({ ok: true });
}
