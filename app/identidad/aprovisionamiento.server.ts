import "server-only";

import { escribir } from "../lib/datos";
import type { IdentidadVerificada } from "./firebase.server";
import {
  SQL_APROVISIONAR,
  SQL_BLOQUEAR_APROVISIONAMIENTO,
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
      await ejecutar(SQL_BLOQUEAR_APROVISIONAMIENTO, [identidad.uid]);
      const filas = await ejecutar(SQL_APROVISIONAR, parametrosDeAprovisionamiento(identidad));
      return interpretarAprovisionamiento(filas);
    },
    { suceso: "aprovisionar-cliente" },
  );
}
