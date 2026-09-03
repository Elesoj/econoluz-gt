import { obtenerCarrito, vaciarCarrito } from "@/app/tienda/carrito.server";
import { fallar, falloDelCarrito, origenValido, responder, usuarioDeLaSesion } from "./comun";

// `firebase-admin` verifica la cookie de sesión y necesita runtime de Node.
export const runtime = "nodejs";

/** El carrito del cliente con sesión. */
export async function GET() {
  const sesion = await usuarioDeLaSesion();
  if (!sesion.ok) return fallar(sesion.error);

  try {
    return responder({ ok: true, carrito: await obtenerCarrito(sesion.userId) });
  } catch (error) {
    return falloDelCarrito("carrito-lectura-fallida", error);
  }
}

/** Vaciarlo. Las líneas se van; el carrito y su token de fusión se quedan. */
export async function DELETE(request: Request) {
  if (!origenValido(request)) return fallar("origen-no-valido");

  const sesion = await usuarioDeLaSesion();
  if (!sesion.ok) return fallar(sesion.error);

  try {
    return responder({ ok: true, carrito: await vaciarCarrito(sesion.userId) });
  } catch (error) {
    return falloDelCarrito("carrito-vaciado-fallido", error);
  }
}
