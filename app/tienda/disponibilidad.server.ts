"use server";

import "server-only";

import { neon } from "@neondatabase/serverless";
import { CANTIDAD_MAXIMA_POR_LINEA, type LineaCarrito } from "./carrito";
import { decidirDisponibilidad, type Disponibilidad } from "./disponibilidad";

/**
 * Contesta si hay inventario para lo que el cliente tiene en el carrito.
 *
 * El navegador manda referencias y cantidades —lo único que guarda— y recibe
 * de vuelta un sí o un no por línea. Las existencias no viajan al catálogo
 * público justamente para que nadie pueda leer el inventario entero: aquí solo
 * se contesta por los productos que esa persona ya eligió.
 *
 * Como todo lo que llega del navegador, la entrada es dato ajeno: se valida y
 * se recorta antes de consultar nada.
 */
export async function consultarDisponibilidad(
  lineas: readonly LineaCarrito[],
): Promise<Disponibilidad> {
  const validas = Array.isArray(lineas)
    ? lineas.filter(
        (linea): linea is LineaCarrito =>
          typeof linea?.econoluzReference === "string" &&
          linea.econoluzReference.length > 0 &&
          Number.isSafeInteger(linea?.cantidad) &&
          linea.cantidad >= 1 &&
          linea.cantidad <= CANTIDAD_MAXIMA_POR_LINEA,
      )
    : [];

  if (validas.length === 0) {
    return {};
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Sin base de datos no se sabe nada del inventario, y no saber nada no
    // autoriza a frenar una compra: se contesta que alcanza.
    return Object.fromEntries(
      validas.map((linea) => [
        linea.econoluzReference,
        { econoluzReference: linea.econoluzReference, alcanza: true },
      ]),
    );
  }

  const sql = neon(connectionString);
  const referencias = validas.map((linea) => linea.econoluzReference);

  try {
    const filas = (await sql.query(
      "select econoluz_reference, stock from products where econoluz_reference = any($1)",
      [referencias],
    )) as { econoluz_reference: string; stock: number | null }[];

    const existenciasPorReferencia = new Map(
      filas.map((fila) => [fila.econoluz_reference, fila.stock]),
    );

    return Object.fromEntries(
      validas.map((linea) => [
        linea.econoluzReference,
        decidirDisponibilidad(
          linea,
          existenciasPorReferencia.get(linea.econoluzReference) ?? null,
        ),
      ]),
    );
  } catch (error) {
    // Si Neon no contesta, el carrito tiene que seguir funcionando: se calla y
    // no avisa de plazos que no puede comprobar. Queda constancia en el log.
    console.error(
      "[tienda] no se pudo consultar el inventario; el carrito sigue sin avisos:",
      error,
    );

    return {};
  }
}
