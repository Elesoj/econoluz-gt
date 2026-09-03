import { fusionarCarrito } from "@/app/tienda/carrito.server";
import { validarCuerpoDeFusion } from "@/app/tienda/carritoContratos";
import {
  fallar,
  falloDelCarrito,
  leerCuerpoAcotado,
  origenValido,
  responder,
  usuarioDeLaSesion,
} from "../comun";

export const runtime = "nodejs";

/**
 * Fusiona el carrito anónimo del navegador con el del cliente que acaba de entrar.
 *
 * Devuelve el carrito resultante **y los descartes**, para que la pantalla pueda decir qué
 * se quedó fuera y por qué. El navegador solo borra su carrito local cuando esta respuesta
 * llega bien: si falla, lo conserva entero y volverá a intentarlo con el mismo token.
 */
export async function POST(request: Request) {
  if (!origenValido(request)) return fallar("origen-no-valido");

  const sesion = await usuarioDeLaSesion();
  if (!sesion.ok) return fallar(sesion.error);

  const cuerpo = await leerCuerpoAcotado(request);
  if (!cuerpo.ok) return fallar(cuerpo.error);

  const datos = validarCuerpoDeFusion(cuerpo.valor);
  if (!datos.ok) return fallar(datos.error);

  try {
    const resultado = await fusionarCarrito(sesion.userId, datos.valor);
    return resultado.ok
      ? responder({ ok: true, carrito: resultado.carrito, descartes: resultado.descartes })
      : fallar(resultado.error);
  } catch (error) {
    return falloDelCarrito("carrito-fusion-fallida", error);
  }
}
