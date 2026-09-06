"use client";

import { useId, useState } from "react";
import { productTypes, applications } from "../../../data/catalogTaxonomy";

type AplicacionOpcion = {
  id: string;
  label: string;
};

type TipoOpcion = {
  id: string;
  label: string;
  applications: readonly string[];
};

const tiposListado: TipoOpcion[] = Object.values(productTypes);

const claseCampo =
  "min-h-11 w-full rounded-xl border border-proyectos/25 px-4 text-base text-proyectos";
const claseEtiqueta = "text-sm font-semibold text-proyectos";

export default function SelectorTipoAplicacion({
  tipoInicial,
  aplicacionInicial,
  familiaInicial = "",
  prefijoInicial,
  mostrarPrefijo = false,
  prefijosSugeridosMap,
}: {
  tipoInicial: string;
  aplicacionInicial: string;
  familiaInicial?: string;
  prefijoInicial?: string;
  mostrarPrefijo?: boolean;
  prefijosSugeridosMap?: Record<string, string>;
}) {
  const tipoId = useId();
  const aplicacionId = useId();
  const familiaId = useId();
  const prefijoId = useId();

  const [tipoSeleccionado, setTipoSeleccionado] = useState(
    tipoInicial || tiposListado[0]?.id || "",
  );

  const tipoActual =
    productTypes[tipoSeleccionado as keyof typeof productTypes] ?? tiposListado[0];

  const aplicacionesValidas: AplicacionOpcion[] = tipoActual
    ? tipoActual.applications.map((appId: string) => ({
        id: appId,
        label: applications[appId as keyof typeof applications]?.label ?? appId,
      }))
    : [];


  const appsDelTipo: readonly string[] = tipoActual ? tipoActual.applications : [];

  const [aplicacionSeleccionada, setAplicacionSeleccionada] = useState(() => {
    if (tipoActual && appsDelTipo.includes(aplicacionInicial)) {
      return aplicacionInicial;
    }
    return aplicacionesValidas[0]?.id ?? "";
  });

  const [prefijoEscrito, setPrefijoEscrito] = useState(prefijoInicial ?? "");

  const handleTipoChange = (nuevoTipo: string) => {
    setTipoSeleccionado(nuevoTipo);
    const tipoObj = productTypes[nuevoTipo as keyof typeof productTypes];
    if (tipoObj) {
      const appsDelNuevo: readonly string[] = tipoObj.applications;
      if (!appsDelNuevo.includes(aplicacionSeleccionada)) {
        setAplicacionSeleccionada(appsDelNuevo[0] ?? "");
      }
    }
  };


  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={tipoId} className={claseEtiqueta}>
          Tipo de producto
        </label>
        <select
          id={tipoId}
          name="tipo"
          value={tipoSeleccionado}
          onChange={(e) => handleTipoChange(e.target.value)}
          className={claseCampo}
          required
        >
          {tiposListado.map((valor) => (
            <option key={valor.id} value={valor.id}>
              {valor.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={aplicacionId} className={claseEtiqueta}>
          Aplicación
        </label>
        <select
          id={aplicacionId}
          name="aplicacion"
          value={aplicacionSeleccionada}
          onChange={(e) => setAplicacionSeleccionada(e.target.value)}
          className={claseCampo}
          required
        >
          {aplicacionesValidas.map((aplicacion) => (
            <option key={aplicacion.id} value={aplicacion.id}>
              {aplicacion.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Disponibles para {tipoActual?.label ?? "este tipo"}:{" "}
          {aplicacionesValidas.map((a) => a.label).join(", ")}.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={familiaId} className={claseEtiqueta}>
          Familia
        </label>
        <input
          id={familiaId}
          name="familia"
          defaultValue={familiaInicial}
          className={claseCampo}
        />
      </div>

      {mostrarPrefijo ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={prefijoId} className={claseEtiqueta}>
            Prefijo de la referencia
          </label>
          <input
            id={prefijoId}
            name="prefijo"
            value={prefijoEscrito}
            onChange={(e) => setPrefijoEscrito(e.target.value)}
            placeholder="Se pone solo según el tipo"
            className={`${claseCampo} font-mono uppercase`}
          />
          <p className="text-xs leading-5 text-neutral-500">
            Déjalo vacío y se usa el que corresponde:{" "}
            {tiposListado
              .map(
                (valor) =>
                  `${valor.label} → ECO-${(prefijosSugeridosMap && prefijosSugeridosMap[valor.id]) || "CAT"}`,
              )
              .join(" · ")}
            . Solo forma parte del código; no cambia nada de cómo funciona el producto.
          </p>
        </div>
      ) : null}
    </div>
  );
}
