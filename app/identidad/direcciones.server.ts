import "server-only";

import { escribir, leer } from "../lib/datos";
import {
  SQL_INSERTAR_DIRECCION,
  SQL_LISTAR_DIRECCIONES,
  SQL_QUITAR_PREDETERMINADA,
  type DireccionValidada,
} from "./direcciones";

export async function listarDirecciones(userId: string) {
  return leer<Record<string, unknown>>(SQL_LISTAR_DIRECCIONES, [userId]);
}

/** Conserva el cambio de predeterminada y el alta en una sola transacción. */
export async function guardarDireccion(userId: string, direccion: DireccionValidada) {
  return escribir(
    async (ejecutar) => {
      if (direccion.predeterminada) {
        await ejecutar(SQL_QUITAR_PREDETERMINADA, [userId]);
      }

      const filas = await ejecutar(SQL_INSERTAR_DIRECCION, [
        userId,
        direccion.destinatario,
        direccion.telefono,
        direccion.departamento,
        direccion.municipio,
        direccion.direccion,
        direccion.referencias,
        direccion.predeterminada,
        direccion.departamentoCodigo ?? null,
        direccion.municipioCodigo ?? null,
      ]);

      return String(filas[0]?.id ?? "");
    },
    { suceso: "guardar-direccion" },
  );
}
