"use client";

import { useEffect, useRef, useState } from "react";

export default function ModalAvisoOperacion({
  guardados,
  errores,
  creado,
  guardado,
  mensajeExito,
}: {
  guardados?: number;
  errores?: string;
  creado?: boolean;
  guardado?: boolean;
  mensajeExito?: string;
}) {
  const [cerradoManual, setCerradoManual] = useState(false);
  const [autocerrado, setAutocerrado] = useState(false);
  const botonEntendidoRef = useRef<HTMLButtonElement | null>(null);

  const hayExito = Boolean(
    (guardados && guardados > 0) || creado || guardado || mensajeExito,
  );
  const hayError = Boolean(errores && errores.trim().length > 0);
  const visible = (hayExito || hayError) && !cerradoManual && !autocerrado;

  // Manejo de tecla Escape y autofocus
  useEffect(() => {
    if (!visible) return;

    botonEntendidoRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCerradoManual(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  // Autocierre a los 3.5 segundos si es éxito
  useEffect(() => {
    if (hayExito && !hayError) {
      const timer = setTimeout(() => {
        setAutocerrado(true);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [hayExito, hayError]);

  if (!visible) return null;

  let textoTitulo = "Aviso de operación";
  let textoDescripcion = "";
  let tipoColor: "exito" | "error" = "exito";

  if (hayError) {
    tipoColor = "error";
    textoTitulo = "Error al procesar los cambios";
    textoDescripcion = errores || "Se produjeron errores durante la operación.";
  } else if (creado) {
    textoTitulo = "¡Producto creado con éxito!";
    textoDescripcion =
      "El producto ha sido dado de alta. Ya puedes completar sus especificaciones, precio y código del fabricante.";
  } else if (guardados && guardados > 0) {
    textoTitulo = "Cambios guardados correctamente";
    textoDescripcion =
      guardados === 1
        ? "Se ha guardado 1 producto y el catálogo público se ha actualizado de inmediato."
        : `Se han guardado ${guardados} productos y el catálogo público se ha actualizado de inmediato.`;
  } else if (guardado) {
    textoTitulo = "Ficha actualizada correctamente";
    textoDescripcion =
      "Los datos del producto y su proyección pública se han sincronizado.";
  } else if (mensajeExito) {
    textoTitulo = "Operación completada";
    textoDescripcion = mensajeExito;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      aria-describedby="modal-descripcion"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs transition-opacity duration-300"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 sm:p-8">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              tipoColor === "exito"
                ? "bg-tienda/10 text-tienda"
                : "bg-error/10 text-error"
            }`}
          >
            {tipoColor === "exito" ? (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 7.5h.008v.008H12v-.008z"
                />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 id="modal-titulo" className="text-lg font-semibold text-proyectos">
              {textoTitulo}
            </h3>
            <p id="modal-descripcion" className="mt-2 text-sm leading-5 text-neutral-600">
              {textoDescripcion}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            ref={botonEntendidoRef}
            type="button"
            onClick={() => setCerradoManual(true)}
            className={`min-h-11 rounded-full px-6 text-sm font-semibold text-white transition duration-300 ${
              tipoColor === "exito"
                ? "bg-tienda hover:bg-tienda-fuerte"
                : "bg-error hover:bg-red-700"
            }`}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
