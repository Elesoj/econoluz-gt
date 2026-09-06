import "server-only";

import { escribir } from "../../lib/datos";
import { proyectarProductoEnTransaccion } from "../../data/proyeccionPublicaTransaccion";
import { crearProducto, type ProductoNuevo } from "./nuevo";

/**
 * Crea un nuevo producto y, en la misma transacción atómica, proyecta a
 * `public_products` si el producto nace publicado (o asegura su consistencia).
 */
export async function crearProductoEnCatalogo(datos: ProductoNuevo): Promise<string> {
  return escribir(
    async (ejecutar) => {
      const referencia = await crearProducto(ejecutar, datos);
      await proyectarProductoEnTransaccion(ejecutar, referencia);
      return referencia;
    },
    { suceso: "crear-producto" },
  );
}
