import "server-only";

import { leer } from "../../lib/datos";
import {
  guardarFichaProducto,
  leerProductoPorReferencia,
  type CambioFicha,
  type ProductoFicha,
} from "./ficha";

/**
 * Solo la conexión, ahora por la capa de datos. Todo lo demás vive en
 * `ficha.ts`, que es puro: así se puede probar sin base de datos y lo pueden
 * usar los scripts de terminal, que no saben resolver "server-only".
 *
 * Tanto la lectura como el guardado resuelven una sola sentencia, así que van
 * por `leer` y su atomicidad queda igual que antes del traslado. La
 * comprobación de `DATABASE_URL` se conserva para que el error siga saliendo
 * aquí y no en la primera consulta.
 */
function conectar() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL.");
  }

  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
}

export async function getProductoFicha(referencia: string): Promise<ProductoFicha | null> {
  return leerProductoPorReferencia(conectar(), referencia);
}

export async function saveProductoFicha(cambio: CambioFicha): Promise<void> {
  return guardarFichaProducto(conectar(), cambio);
}
