"use client";

import { fusionarRemoto, leerCarritoRemoto } from "./carritoRemoto";
import {
  comprobarSesionYSincronizar,
  sincronizarAlEntrar,
  type ResultadoDeComprobacion,
} from "./carritoSincronizacion";
import { activarModoRemoto } from "./carritoStore";

/**
 * El enganche del carrito con la sesión, en un solo sitio.
 *
 * Lo usan dos: `SincronizarCarrito`, montado en el layout, que comprueba **una vez por
 * pestaña**; y la pantalla de acceso, que lo llama con `forzar` en cuanto la sesión queda
 * abierta. Ese segundo camino no es un lujo: iniciar sesión no remonta el layout, así que
 * sin él la fusión no ocurriría hasta la siguiente recarga y el cliente recién entrado
 * seguiría viendo su carrito local como si no hubiera pasado nada.
 *
 * La política —cuándo preguntar, cuándo marcar la pestaña y qué hacer si algo falla— vive
 * en `carritoSincronizacion`, que se prueba sin navegador. Aquí solo están el
 * `sessionStorage`, el `localStorage` y la red.
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

const yaComprobado = () => {
  try {
    return window.sessionStorage.getItem(CLAVE_COMPROBADO) === "1";
  } catch {
    return false;
  }
};

const anotarComprobado = () => {
  try {
    window.sessionStorage.setItem(CLAVE_COMPROBADO, "1");
  } catch {
    // Sin `sessionStorage` se preguntará otra vez; es una petición, no un problema.
  }
};

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
    // Nada que hacer: el servidor ya lo recuerda y no aceptará el mismo dos veces.
  }
}

export function engancharCarritoConLaSesion(
  forzar = false,
): Promise<ResultadoDeComprobacion> {
  return comprobarSesionYSincronizar({
    forzar,
    yaComprobado,
    anotarComprobado,
    // Si no hay sesión, esto responde 401 y aquí se acaba: el visitante anónimo sigue con
    // su carrito local, exactamente como hasta ahora.
    haySesion: async () => (await leerCarritoRemoto()).ok,
    entrar: async () => {
      const resultado = await sincronizarAlEntrar({
        almacen: window.localStorage,
        token: tokenDeFusion(),
        fusionar: fusionarRemoto,
      });

      if (resultado.ok) {
        // La fusión ya está guardada: el token cumplió su función y el siguiente inicio de
        // sesión traerá uno nuevo, o el servidor lo tomaría por un reintento.
        olvidarToken();
        activarModoRemoto(resultado.lineas);
      }

      return resultado;
    },
  });
}
