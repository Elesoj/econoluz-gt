"use client";

import { useActionState } from "react";

export type EstadoDelFormulario = { mensaje: string; guardada: boolean };

export const ESTADO_INICIAL: EstadoDelFormulario = { mensaje: "", guardada: false };

const CAMPOS: readonly (readonly [string, string, string])[] = [
  ["destinatario", "Quién recibe", "text"],
  ["telefono", "Teléfono", "tel"],
  ["departamento", "Departamento", "text"],
  ["municipio", "Municipio", "text"],
  ["direccion", "Dirección", "text"],
];

/**
 * El formulario vive aparte de la página porque necesita estado: antes la acción
 * descartaba en silencio lo que no validaba y el cliente se quedaba mirando la pantalla sin
 * saber por qué no se había guardado nada.
 *
 * El aviso se anuncia con `role="alert"` para que un lector de pantalla lo lea al aparecer;
 * si no, el único cambio de la página sería visual y quien no ve la pantalla seguiría sin
 * enterarse.
 */
export default function FormularioDireccion({
  accion,
}: {
  accion: (estado: EstadoDelFormulario, datos: FormData) => Promise<EstadoDelFormulario>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={enviar} className="mt-10 space-y-3">
      <h2 className="text-lg font-medium text-[#001B59]">Agregar una dirección</h2>

      {estado.mensaje ? (
        <p
          role="alert"
          className="rounded border border-[#E11133] bg-[#E11133]/5 px-3 py-2 text-sm text-[#B80D28]"
        >
          {estado.mensaje}
        </p>
      ) : null}

      {estado.guardada ? (
        <p role="status" className="text-sm text-[#001B59]">
          Dirección guardada.
        </p>
      ) : null}

      {CAMPOS.map(([nombre, etiqueta, tipo]) => (
        <label key={nombre} className="block text-sm text-neutral-700">
          {etiqueta}
          <input
            type={tipo}
            name={nombre}
            required
            placeholder={nombre === "telefono" ? "4042 8790" : undefined}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      ))}

      <label className="block text-sm text-neutral-700">
        Referencias para encontrarla
        <input
          name="referencias"
          placeholder="Portón negro frente a la tienda"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="predeterminada" />
        Usar como predeterminada
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="rounded bg-[#E11133] px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {enviando ? "Guardando…" : "Guardar dirección"}
      </button>
    </form>
  );
}
