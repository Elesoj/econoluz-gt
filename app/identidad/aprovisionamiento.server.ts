import "server-only";

import { escribir } from "../lib/datos";
import type { IdentidadVerificada } from "./firebase.server";
import {
  SQL_APROVISIONAR,
  interpretarAprovisionamiento,
  parametrosDeAprovisionamiento,
  type ClienteAprovisionado,
} from "./aprovisionamiento";

/** Ejecuta el `upsert` de forma transaccional a través de la capa de datos. */
export async function aprovisionarCliente(
  identidad: IdentidadVerificada,
): Promise<ClienteAprovisionado> {
  return escribir(
    async (ejecutar) => {
      const filas = await ejecutar(SQL_APROVISIONAR, parametrosDeAprovisionamiento(identidad));
      return interpretarAprovisionamiento(filas);
    },
    { suceso: "aprovisionar-cliente" },
  );
}
