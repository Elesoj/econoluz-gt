import { eliminarLinea, fijarCantidad } from "@/app/tienda/carrito.server";
import {
  validarCuerpoDeLinea,
  validarCuerpoDeReferencia,
} from "@/app/tienda/carritoContratos";
import {
  fallar,
  falloDelCarrito,
  leerCuerpoAcotado,
  origenValido,
  responder,
  usuarioDeLaSesion,
} from "../comun";

export const runtime = "nodejs";

/** Fija la cantidad de una línea. La cantidad válida empieza en 1; para quitar, DELETE. */
export async function PUT(request: Request) {
  if (!origenValido(request)) return fallar("origen-no-valido");

  const sesion = await usuarioDeLaSesion();
  if (!sesion.ok) return fallar(sesion.error);

  const cuerpo = await leerCuerpoAcotado(request);
  if (!cuerpo.ok) return fallar(cuerpo.error);

  const datos = validarCuerpoDeLinea(cuerpo.valor);
  if (!datos.ok) return fallar(datos.error);

  try {
    const resultado = await fijarCantidad(
      sesion.userId,
      datos.valor.econoluzReference,
      datos.valor.cantidad,
    );
    return resultado.ok
      ? responder({ ok: true, carrito: resultado.carrito })
      : fallar(resultado.error);
  } catch (error) {
    return falloDelCarrito("carrito-fijar-fallido", error);
  }
}

/** Quita una línea entera. */
export async function DELETE(request: Request) {
  if (!origenValido(request)) return fallar("origen-no-valido");

  const sesion = await usuarioDeLaSesion();
  if (!sesion.ok) return fallar(sesion.error);

  const cuerpo = await leerCuerpoAcotado(request);
  if (!cuerpo.ok) return fallar(cuerpo.error);

  const datos = validarCuerpoDeReferencia(cuerpo.valor);
  if (!datos.ok) return fallar(datos.error);

  try {
    const carrito = await eliminarLinea(sesion.userId, datos.valor.econoluzReference);
    return responder({ ok: true, carrito });
  } catch (error) {
    return falloDelCarrito("carrito-eliminar-fallido", error);
  }
}
