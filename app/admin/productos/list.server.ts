import "server-only";

import { escribir, leer } from "../../lib/datos";
import { proyectarProductoEnTransaccion } from "../../data/proyeccionPublicaTransaccion";
import { leerProductosAdmin, type FiltrosProductos, type ResultadoListado } from "./list";

/**
 * Conexión de lectura para listado y contadores.
 */
function conectar() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL.");
  }

  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
}

export async function getProductosAdmin(filtros: FiltrosProductos): Promise<ResultadoListado> {
  return leerProductosAdmin(conectar(), filtros);
}

export type CambioProducto = {
  referencia: string;
  precio: number | null;
  existencias: number | null;
  publicado: boolean;
};

/**
 * Guarda los cambios de una fila. Se actualiza solo lo que administra la
 * persona: `CLAUDE.md` y el importador respetan estas cuatro columnas, y el
 * resto del producto se edita en su ficha, no aquí.
 *
 * La actualización de `products` y la proyección en `public_products` se realizan
 * dentro de la misma transacción atómica con `escribir()`.
 */
export async function guardarCambiosProducto(cambio: CambioProducto): Promise<void> {
  await escribir(
    async (ejecutar) => {
      await ejecutar(
        `
          update products
          set price_gtq = $1,
              stock = $2,
              published = $3
          where econoluz_reference = $4
        `,
        [cambio.precio, cambio.existencias, cambio.publicado, cambio.referencia],
      );
      await proyectarProductoEnTransaccion(ejecutar, cambio.referencia);
    },
    { suceso: "guardar-cambios-producto" },
  );
}
