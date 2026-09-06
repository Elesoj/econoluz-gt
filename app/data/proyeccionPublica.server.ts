"server-only";

import { escribir } from "../lib/datos";
import {
  proyectarProductoEnTransaccion,
  type EjecutorProyeccion,
} from "./proyeccionPublicaTransaccion";

export { proyectarProductoEnTransaccion, type EjecutorProyeccion };

/** Reescribe la proyección de un producto dentro de su propia transacción. Idempotente. */
export async function proyectarProducto(referencia: string) {
  await escribir(
    async (ejecutar) => {
      await proyectarProductoEnTransaccion(ejecutar, referencia);
    },
    { suceso: "proyectar-producto" },
  );
}
