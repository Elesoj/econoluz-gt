"use client";

import { useEffect } from "react";
import { auth } from "./firebaseCliente";

/**
 * Alarga la sesión del cliente sin que tenga que volver a entrar.
 *
 * Una cookie de sesión de Firebase **no se puede alargar desde el servidor**: hace falta un
 * testigo de identidad nuevo, y eso solo lo produce el navegador. Por eso el servidor
 * decide *si* toca —`debeRenovarSesion`, que está probada— y este componente se limita a
 * pedirle el testigo a Firebase y mandarlo a la misma ruta que abre la sesión.
 *
 * Solo actúa pasada la mitad de la vida de la sesión, así que en el uso normal ocurre una
 * vez cada varios días, no en cada carga.
 *
 * **Falla en silencio a propósito.** Si Firebase no contesta o el usuario ya no está en el
 * navegador, no hay nada que decirle: su sesión sigue siendo válida hasta caducar y volverá
 * a intentarse en la siguiente visita. Avisar de un fallo que no le pide nada solo
 * asustaría.
 */
export default function RenovarSesion({ debeRenovar }: { debeRenovar: boolean }) {
  useEffect(() => {
    if (!debeRenovar) return;

    let cancelado = false;

    (async () => {
      try {
        const sesion = auth();
        // El SDK restaura la sesión del navegador de forma asíncrona: sin esperar,
        // `currentUser` sería null en la primera carga y la renovación no ocurriría nunca.
        await sesion.authStateReady();

        const usuario = sesion.currentUser;
        if (!usuario || cancelado) return;

        const idToken = await usuario.getIdToken(true);
        if (cancelado) return;

        await fetch("/api/clientes/sesion", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ idToken }),
        });
      } catch {
        // Silencio deliberado: ver el comentario de arriba.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [debeRenovar]);

  return null;
}
