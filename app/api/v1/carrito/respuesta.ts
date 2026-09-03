import { esMismoOrigen } from "../../../identidad/origen";
import {
  BYTES_MAXIMOS_DEL_CUERPO,
  estadoDelError,
  type ErrorDeCarrito,
} from "../../../tienda/carritoContratos";

/**
 * La forma de las respuestas del carrito y las comprobaciones del sobre: origen, tamaño y
 * cabeceras.
 *
 * Está separado de `comun.ts` porque aquello arrastra la sesión y el registro, y con ellos
 * `server-only`, que fuera de Next no se resuelve. Aquí no hay nada de eso, así que estas
 * tres reglas —que un carrito ajeno no se cachee, que el cuerpo esté acotado y que una
 * mutación venga del propio sitio— se prueban de verdad y no por inspección del texto.
 */

/**
 * El carrito de un cliente no puede quedarse en ninguna caché intermedia.
 *
 * Next ya marca como dinámicas las rutas que leen la cookie, pero eso es una consecuencia
 * del framework y no una promesa escrita: si mañana una de estas rutas dejara de leer la
 * sesión antes de responder, la cabecera desaparecería sin que nadie se enterase.
 */
const SIN_CACHE = "private, no-store, max-age=0, must-revalidate";

export const responder = (cuerpo: unknown, estado = 200) =>
  Response.json(cuerpo, { status: estado, headers: { "cache-control": SIN_CACHE } });

export const fallar = (error: ErrorDeCarrito) =>
  responder({ ok: false, error }, estadoDelError(error));

/** Las mutaciones solo se aceptan desde el propio sitio. */
export function origenValido(request: Request): boolean {
  return esMismoOrigen(request.headers.get("origin"), request.headers.get("host"));
}

/**
 * Lee el cuerpo con un tope de bytes.
 *
 * Se mide el texto recibido y no `content-length`, que lo pone quien llama y por tanto no
 * garantiza nada.
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

  // En bytes de verdad: `String.length` cuenta unidades UTF-16, así que un cuerpo lleno de
  // acentos pasaría de largo un tope que dice llamarse de bytes.
  if (Buffer.byteLength(texto, "utf8") > BYTES_MAXIMOS_DEL_CUERPO) {
    return { ok: false, error: "cuerpo-demasiado-grande" };
  }

  try {
    return { ok: true, valor: texto.length === 0 ? {} : JSON.parse(texto) };
  } catch {
    return { ok: false, error: "cuerpo-invalido" };
  }
}
