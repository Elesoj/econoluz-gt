import { leerClienteActual } from "@/app/identidad/sesion.server";
import { registrar } from "@/app/lib/datos";
import type { ErrorDeCarrito } from "@/app/tienda/carritoContratos";
import { fallar } from "./respuesta";

/**
 * Lo que comparten las tres rutas del carrito y necesita el servidor: quién eres y qué se
 * registra cuando algo falla.
 *
 * La forma del sobre —cabeceras, tamaño del cuerpo y origen— vive en `respuesta.ts`, que
 * no arrastra `server-only` y por eso se puede probar fuera de Next.
 */

export { fallar, leerCuerpoAcotado, origenValido, responder } from "./respuesta";

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

/**
 * Convierte cualquier fallo del carrito en una respuesta saneada.
 *
 * Del error solo se registra su **clase**: el texto puede llevar el nombre de una tabla, la
 * consulta entera o la cadena de conexión, y de ahí a un registro compartido hay un paso.
 * Al cliente le llega un código, nunca un mensaje.
 */
export function falloDelCarrito(suceso: string, error: unknown) {
  registrar("error", suceso, {
    causa: error instanceof Error ? error.constructor.name : "desconocida",
  });
  return fallar("carrito-no-disponible");
}
