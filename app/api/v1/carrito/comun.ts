import { esMismoOrigen } from "@/app/identidad/origen";
import { leerClienteActual } from "@/app/identidad/sesion.server";
import { registrar } from "@/app/lib/datos";
import {
  BYTES_MAXIMOS_DEL_CUERPO,
  estadoDelError,
  type ErrorDeCarrito,
} from "@/app/tienda/carritoContratos";

/**
 * Lo que comparten las tres rutas del carrito.
 *
 * Vive aquí y no repetido en cada `route.ts` porque son justo las comprobaciones que no
 * pueden faltar en ninguna: quién eres, de dónde vienes y cuánto ocupa lo que mandas.
 * Tres copias de esto son tres sitios donde arreglar el día que una se quede corta.
 */

export const responder = (cuerpo: unknown, estado = 200) => Response.json(cuerpo, { status: estado });

export const fallar = (error: ErrorDeCarrito) =>
  responder({ ok: false, error }, estadoDelError(error));

/**
 * El identificador del cliente, **de la cookie de sesión verificada**.
 *
 * Nunca del cuerpo de la petición: aceptarlo de ahí convertiría el carrito ajeno en un
 * campo más del JSON.
 */
export async function usuarioDeLaSesion(): Promise<
  { ok: true; userId: string } | { ok: false; error: ErrorDeCarrito }
> {
  const cliente = await leerClienteActual();
  return cliente ? { ok: true, userId: cliente.id } : { ok: false, error: "sin-sesion" };
}

/** Las mutaciones solo se aceptan desde el propio sitio. */
export function origenValido(request: Request): boolean {
  return esMismoOrigen(request.headers.get("origin"), request.headers.get("host"));
}

/**
 * Lee el cuerpo con un tope de bytes.
 *
 * Se mide el texto recibido en vez de fiarse de `content-length`, que lo pone quien
 * llama y por tanto no es una garantía de nada.
 */
export async function leerCuerpoAcotado(
  request: Request,
): Promise<{ ok: true; valor: unknown } | { ok: false; error: ErrorDeCarrito }> {
  let texto: string;
  try {
    texto = await request.text();
  } catch {
    return { ok: false, error: "cuerpo-invalido" };
  }

  if (texto.length > BYTES_MAXIMOS_DEL_CUERPO) {
    return { ok: false, error: "cuerpo-demasiado-grande" };
  }

  try {
    return { ok: true, valor: texto.length === 0 ? {} : JSON.parse(texto) };
  } catch {
    return { ok: false, error: "cuerpo-invalido" };
  }
}

/**
 * Convierte cualquier fallo del carrito en una respuesta saneada.
 *
 * Del error solo se registra su **clase**: el texto puede llevar el nombre de una tabla,
 * la consulta entera o la cadena de conexión, y de ahí a un registro compartido hay un
 * paso. Al cliente le llega un código, nunca un mensaje.
 */
export function falloDelCarrito(suceso: string, error: unknown) {
  registrar("error", suceso, {
    causa: error instanceof Error ? error.constructor.name : "desconocida",
  });
  return fallar("carrito-no-disponible");
}
