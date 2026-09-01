import "server-only";

import { escribir } from "../lib/datos";
import {
  SQL_ANONIMIZAR_USUARIO,
  SQL_BORRAR_DIRECCIONES,
  SQL_DESLIGAR_EVENTOS,
  correoAnonimo,
  uidAnonimo,
} from "./anonimizacion";
import { revocarYBorrarUsuario } from "./firebase.server";

/**
 * Primero elimina la identidad. Si Neon falla después, el barrido de
 * reconciliación puede terminar la anonimización sin dejar una cuenta activa.
 */
export async function borrarCuenta(userId: string, uid: string): Promise<void> {
  await revocarYBorrarUsuario(uid);

  await escribir(
    async (ejecutar) => {
      await ejecutar(SQL_BORRAR_DIRECCIONES, [userId]);
      await ejecutar(SQL_DESLIGAR_EVENTOS, [userId]);
      await ejecutar(SQL_ANONIMIZAR_USUARIO, [
        userId,
        correoAnonimo(userId),
        uidAnonimo(userId),
      ]);
    },
    { suceso: "borrar-cuenta" },
  );
}
