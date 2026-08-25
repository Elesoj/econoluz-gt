"use client";

import { useEffect } from "react";

/** El servidor no acepta más de una renovación cada quince minutos. */
const INTERVALO_MINIMO_MS = 15 * 60 * 1000;

/**
 * Mantiene viva la sesión mientras se trabaja de verdad. No recibe ni un solo
 * dato de negocio a propósito: es un componente de cliente, y todo lo que
 * recibiera acabaría en el JavaScript que descarga el navegador.
 *
 * Escucha actividad real —teclado, puntero, envío de formulario—, no el paso
 * del tiempo: una pestaña olvidada abierta no debe conservar el acceso.
 */
export default function SessionActivity() {
  useEffect(() => {
    // La sesión acaba de validarse al pintar la página: la cuenta empieza ya.
    let ultimaRenovacion = Date.now();
    let enCurso = false;

    const renovar = () => {
      const ahora = Date.now();
      if (enCurso || ahora - ultimaRenovacion < INTERVALO_MINIMO_MS) {
        return;
      }

      enCurso = true;
      ultimaRenovacion = ahora;

      void fetch("/admin/sesion", { method: "POST" })
        .catch(() => {
          // Un corte de red no debe romper la pantalla: se reintenta con la
          // siguiente actividad.
        })
        .finally(() => {
          enCurso = false;
        });
    };

    const eventos = ["keydown", "pointerdown", "submit"] as const;
    for (const evento of eventos) {
      document.addEventListener(evento, renovar, { capture: true, passive: true });
    }

    return () => {
      for (const evento of eventos) {
        document.removeEventListener(evento, renovar, { capture: true });
      }
    };
  }, []);

  return null;
}
