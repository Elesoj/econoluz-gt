import "server-only";

import { escribir, leer } from "../../lib/datos";
import { proyectarProductoEnTransaccion } from "../../data/proyeccionPublicaTransaccion";
import {
  guardarFichaProducto,
  leerProductoPorReferencia,
  type CambioFicha,
  type ProductoFicha,
} from "./ficha";

/**
 * Solo la conexión para lecturas y transacciones atómicas para escrituras.
 * Al guardar la ficha, actualiza `products` y `public_products` en la misma
 * transacción de modo que si la proyección falla, revierte la mutación.
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
  await escribir(
    async (ejecutar) => {
      await guardarFichaProducto(ejecutar, cambio);
      await proyectarProductoEnTransaccion(ejecutar, cambio.referencia);
    },
    { suceso: "guardar-ficha-producto" },
  );
}
