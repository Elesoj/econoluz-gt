"use client";

import { useId, useState } from "react";
import { finishes } from "../../../data/catalogTaxonomy";

const claseCampo =
  "min-h-11 w-full rounded-xl border border-proyectos/25 px-4 text-base text-proyectos focus:outline-none focus:ring-2 focus:ring-tienda/40";
const claseEtiqueta = "text-sm font-semibold text-proyectos";

type AcabadoInfo = { id: string; label: string };
const listaAcabadosConocidos: AcabadoInfo[] = Object.values(finishes);

export default function SelectorAcabado({
  acabadoInicial = "",
  acabadoEtiquetaInicial = "",
}: {
  acabadoInicial?: string;
  acabadoEtiquetaInicial?: string;
}) {
  const selectId = useId();
  const otroId = useId();

  // Determina si el acabado inicial es conocido o si es "otro"
  const esConocido = Object.hasOwn(finishes, acabadoInicial);
  const esVacio = !acabadoInicial || acabadoInicial === "sin_especificar";

  const [seleccion, setSeleccion] = useState<string>(() => {
    if (esVacio) return "sin_especificar";
    if (esConocido) return acabadoInicial;
    return "otro";
  });

  const [textoOtro, setTextoOtro] = useState<string>(() => {
    if (!esConocido && !esVacio) {
      return acabadoEtiquetaInicial || acabadoInicial;
    }
    return "";
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor={selectId} className={claseEtiqueta}>
          Acabado o color físico
        </label>
        <select
          id={selectId}
          name="acabado"
          value={seleccion}
          onChange={(e) => setSeleccion(e.target.value)}
          className={claseCampo}
        >
          <option value="sin_especificar">Sin especificar</option>
          {listaAcabadosConocidos.map((ac) => (
            <option key={ac.id} value={ac.id}>
              {ac.label}
            </option>
          ))}
          <option value="otro">Otro acabado...</option>
        </select>
      </div>


      {seleccion === "otro" ? (
        <div className="flex flex-col gap-2 animate-fadeIn">
          <label htmlFor={otroId} className="text-xs font-semibold text-tienda">
            Escribe el nombre del acabado
          </label>
          <input
            id={otroId}
            name="acabadoOtro"
            value={textoOtro}
            onChange={(e) => setTextoOtro(e.target.value)}
            placeholder="Ej. Cobre cepillado, Oro rosa, Antracita..."
            className={claseCampo}
            required={seleccion === "otro"}
          />
          <p className="text-xs text-neutral-500">
            Se generará automáticamente un identificador normalizado para el catálogo.
          </p>
        </div>
      ) : null}
    </div>
  );
}
