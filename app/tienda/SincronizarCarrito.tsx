"use client";

import { useEffect } from "react";
import { engancharCarritoConLaSesion } from "./carritoSesion";

/**
 * Enlaza el carrito con la sesión del cliente.
 *
 * No pinta nada. Vive en el layout para estar montado en todas las páginas, porque el
 * carrito se toca desde el catálogo, desde la ficha y desde `/carrito`.
 *
 * **Es cliente y no servidor a propósito.** Leer la cookie de sesión en el layout raíz
 * volvería dinámicas las páginas que hoy se prerrenderizan —el catálogo, el carrito y la
 * asesoría—, y perderíamos la caché que el catálogo necesita. Así que la sesión se
 * pregunta desde el navegador, **una vez por pestaña**: para el visitante anónimo es una
 * sola respuesta 401 y nada más.
 *
 * Iniciar sesión **no remonta este componente**, así que la pantalla de acceso dispara la
 * comprobación por su cuenta en cuanto la sesión queda abierta.
 */
export default function SincronizarCarrito() {
  useEffect(() => {
    void engancharCarritoConLaSesion();
  }, []);

  return null;
}
