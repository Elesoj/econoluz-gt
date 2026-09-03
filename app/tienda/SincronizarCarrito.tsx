"use client";

import { useEffect } from "react";
import { activarModoRemoto } from "./carritoStore";
import { fusionarRemoto, leerCarritoRemoto } from "./carritoRemoto";
import { sincronizarAlEntrar } from "./carritoSincronizacion";

/**
 * Enlaza el carrito con la sesión del cliente.
 *
 * No pinta nada. Vive en el layout para estar montado en todas las páginas, porque el
 * carrito se toca desde el catálogo, desde la ficha y desde `/carrito`, y la fusión tiene
 * que ocurrir una sola vez pase por donde pase el cliente.
 *
 * **Es cliente y no servidor a propósito.** Leer la cookie de sesión en el layout raíz
 * volvería dinámicas las páginas que hoy se prerrenderizan —el catálogo, el carrito y la
 * asesoría—, y perderíamos la caché que el catálogo necesita. Así que la sesión se
 * pregunta desde el navegador, **una vez por pestaña**: para el visitante anónimo es una
 * sola respuesta 401 y nada más.
 */

/** Que la comprobación sea una por pestaña, no una por navegación. */
const CLAVE_COMPROBADO = "econoluz_carrito_sesion";

/**
 * El token de fusión, estable hasta que la fusión salga bien.
 *
 * Guardarlo es lo que hace que un reintento —otra pestaña, una recarga tras un corte de
 * red— sea reconocido por el servidor como el mismo intento y no vuelva a sumar.
 */
const CLAVE_TOKEN = "econoluz_carrito_fusion";

function tokenDeFusion(): string {
  try {
    const guardado = window.localStorage.getItem(CLAVE_TOKEN);
    if (guardado) return guardado;

    const nuevo = crypto.randomUUID();
    window.localStorage.setItem(CLAVE_TOKEN, nuevo);
    return nuevo;
  } catch {
    // Sin almacén no hay idempotencia entre recargas, pero sí dentro de esta visita.
    return crypto.randomUUID();
  }
}

function olvidarToken() {
  try {
    window.localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Nada que hacer: el servidor ya guardó el suyo y no aceptará este dos veces.
  }
}

function yaComprobado(): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE_COMPROBADO) === "1";
  } catch {
    return false;
  }
}

function anotarComprobado() {
  try {
    window.sessionStorage.setItem(CLAVE_COMPROBADO, "1");
  } catch {
    // Sin `sessionStorage` se preguntará otra vez; es una petición, no un problema.
  }
}

export default function SincronizarCarrito() {
  useEffect(() => {
    if (yaComprobado()) return;

    let vigente = true;

    void (async () => {
      // Si no hay sesión, esto responde 401 y aquí se acaba: el visitante anónimo sigue
      // con su carrito local, exactamente como hasta ahora.
      const sesion = await leerCarritoRemoto().catch(() => ({ ok: false }) as const);
      if (!vigente) return;

      anotarComprobado();
      if (!sesion.ok) return;

      const resultado = await sincronizarAlEntrar({
        almacen: window.localStorage,
        token: tokenDeFusion(),
        fusionar: fusionarRemoto,
      });

      if (!vigente || !resultado.ok) {
        // El carrito local se conserva entero y se reintentará con el mismo token en la
        // siguiente pestaña o recarga. Hasta entonces el cliente no pierde nada.
        return;
      }

      // La fusión ya está guardada: el token cumplió su función y el siguiente inicio de
      // sesión traerá uno nuevo, o el servidor lo tomaría por un reintento.
      olvidarToken();
      activarModoRemoto(resultado.lineas);
    })();

    return () => {
      vigente = false;
    };
  }, []);

  return null;
}
