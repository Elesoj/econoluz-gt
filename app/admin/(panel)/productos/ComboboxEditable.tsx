"use client";

import { useId, useState, useRef, useEffect } from "react";

const claseCampo =
  "min-h-11 w-full rounded-xl border border-proyectos/25 px-4 text-base text-proyectos focus:outline-none focus:ring-2 focus:ring-tienda/40";
const claseEtiqueta = "text-sm font-semibold text-proyectos";

export default function ComboboxEditable({
  name,
  etiqueta,
  ayuda,
  defaultValue = "",
  sugerencias = [],
}: {
  name: string;
  etiqueta: string;
  ayuda?: string;
  defaultValue?: string;
  sugerencias?: readonly string[];
}) {
  const inputId = useId();
  const listboxId = useId();
  const [valor, setValor] = useState(defaultValue);
  const [abierto, setAbierto] = useState(false);
  const [indiceResaltado, setIndiceResaltado] = useState<number>(-1);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtrar sugerencias según lo que se va escribiendo
  const sugerenciasFiltradas = sugerencias.filter((sug) =>
    sug.toLowerCase().includes(valor.trim().toLowerCase()),
  );

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickFuera(event: MouseEvent) {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(event.target as Node)
      ) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setIndiceResaltado(0);
      } else {
        setIndiceResaltado((prev) =>
          prev < sugerenciasFiltradas.length - 1 ? prev + 1 : prev,
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (abierto) {
        setIndiceResaltado((prev) => (prev > 0 ? prev - 1 : 0));
      }
    } else if (e.key === "Enter") {
      if (abierto && indiceResaltado >= 0 && sugerenciasFiltradas[indiceResaltado]) {
        e.preventDefault();
        setValor(sugerenciasFiltradas[indiceResaltado]);
        setAbierto(false);
      }
    } else if (e.key === "Escape") {
      if (abierto) {
        e.preventDefault();
        setAbierto(false);
      }
    }
  };

  const seleccionarSugerencia = (sug: string) => {
    setValor(sug);
    setAbierto(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={contenedorRef} className="relative flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className={claseEtiqueta}>
          {etiqueta}
        </label>
        {sugerencias.length > 0 ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setAbierto((prev) => !prev)}
            className="text-xs text-neutral-400 hover:text-tienda"
            aria-label={`Mostrar opciones para ${etiqueta}`}
          >
            {abierto ? "▲ cerrar" : "▼ sugerencias"}
          </button>
        ) : null}
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            if (!abierto) setAbierto(true);
            setIndiceResaltado(-1);
          }}
          onFocus={() => {
            if (sugerencias.length > 0) setAbierto(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={ayuda}
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          aria-controls={abierto ? listboxId : undefined}
          className={claseCampo}
        />
      </div>

      {abierto && sugerenciasFiltradas.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-proyectos/20 bg-white py-1 shadow-lg"
        >
          {sugerenciasFiltradas.map((sug, idx) => {
            const estaResaltado = idx === indiceResaltado;
            return (
              <li
                key={sug}
                role="option"
                aria-selected={valor === sug}
                onClick={() => seleccionarSugerencia(sug)}
                onMouseEnter={() => setIndiceResaltado(idx)}
                className={`cursor-pointer px-4 py-2 text-sm transition ${
                  estaResaltado
                    ? "bg-tienda/10 font-semibold text-tienda"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {sug}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
