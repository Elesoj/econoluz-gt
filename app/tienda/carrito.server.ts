import "server-only";

import { escribir, leer } from "../lib/datos";
import type { Ejecutor } from "../lib/datos/consulta";
import type { CarritoPublico, CuerpoDeFusion } from "./carritoContratos";
import {
  eliminarLineaCon,
  fijarCantidadCon,
  fusionarCarritoCon,
  leerCarritoCon,
  vaciarCarritoCon,
  type ResultadoDeEscritura,
  type ResultadoDeFusionRemota,
} from "./carritoRepositorio";

/**
 * El carrito del cliente, conectado.
 *
 * Aquí solo se junta el repositorio con la conexión de verdad. Toda operación que escriba
 * va dentro de `escribir()`, que abre la transacción y **deshace entera** si algo falla:
 * un carrito a medio fusionar sería peor que no haber fusionado.
 *
 * El identificador del usuario llega **ya verificado** desde la cookie de sesión de
 * Firebase. Ninguna de estas funciones lo saca del cuerpo de la petición.
 */

const ejecutorDeLectura: Ejecutor = (texto, parametros = []) =>
  leer<Record<string, unknown>>(texto, parametros);

export function obtenerCarrito(userId: string): Promise<CarritoPublico> {
  return leerCarritoCon(ejecutorDeLectura, userId);
}

export function fijarCantidad(
  userId: string,
  econoluzReference: string,
  cantidad: number,
): Promise<ResultadoDeEscritura> {
  return escribir(
    (ejecutar) => fijarCantidadCon(ejecutar, userId, econoluzReference, cantidad),
    { suceso: "carrito-fijar" },
  );
}

export function eliminarLinea(
  userId: string,
  econoluzReference: string,
): Promise<CarritoPublico> {
  return escribir((ejecutar) => eliminarLineaCon(ejecutar, userId, econoluzReference), {
    suceso: "carrito-eliminar",
  });
}

export function vaciarCarrito(userId: string): Promise<CarritoPublico> {
  return escribir((ejecutar) => vaciarCarritoCon(ejecutar, userId), {
    suceso: "carrito-vaciar",
  });
}

/**
 * La fusión entera en una sola transacción: bloqueo, lectura, suma, reescritura y token.
 * Si algo falla por el camino no queda nada escrito, y el carrito local del navegador
 * sigue intacto porque solo se borra tras un éxito confirmado.
 */
export function fusionarCarrito(
  userId: string,
  cuerpo: CuerpoDeFusion,
): Promise<ResultadoDeFusionRemota> {
  return escribir((ejecutar) => fusionarCarritoCon(ejecutar, userId, cuerpo), {
    suceso: "carrito-fusionar",
  });
}
