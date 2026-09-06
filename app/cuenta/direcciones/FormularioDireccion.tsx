"use client";

import { useMemo, useState, useActionState } from "react";
import type { DepartamentoCatalogo, MunicipioCatalogo } from "@/app/envios/geografia";
import { ZONAS_CAPITALINAS_VALIDAS } from "@/app/envios/zonasCapitalinas";

export type EstadoDelFormulario = { mensaje: string; guardada: boolean };

export const ESTADO_INICIAL: EstadoDelFormulario = { mensaje: "", guardada: false };

export type FormularioDireccionProps = {
  accion: (estado: EstadoDelFormulario, datos: FormData) => Promise<EstadoDelFormulario>;
  departamentos: readonly DepartamentoCatalogo[];
  municipios: readonly MunicipioCatalogo[];
};

/**
 * El formulario de direcciones con selects encadenados para departamento y municipio.
 * El aviso de error se anuncia con `role="alert"` para accesibilidad.
 */
export default function FormularioDireccion({
  accion,
  departamentos,
  municipios,
}: FormularioDireccionProps) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const [departamentoCodigo, setDepartamentoCodigo] = useState("");
  const [municipioCodigo, setMunicipioCodigo] = useState("");
  const [zonaCapitalina, setZonaCapitalina] = useState("");

  const deptosOrdenados = useMemo(
    () => [...departamentos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [departamentos],
  );

  const municipiosDisponibles = useMemo(() => {
    if (!departamentoCodigo) return [];
    return municipios
      .filter((m) => m.departamento === departamentoCodigo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [municipios, departamentoCodigo]);

  // El mensajero propio solo entra en el municipio de Guatemala, así que la zona
  // se pide únicamente allí.
  const esMunicipioGuatemala = departamentoCodigo === "01" && municipioCodigo === "0101";

  const departamentoNombre =
    departamentos.find((d) => d.codigo === departamentoCodigo)?.nombre ?? "";
  const municipioNombre =
    municipios.find((m) => m.codigo === municipioCodigo)?.nombre ?? "";

  return (
    <form
      key={estado.guardada ? "guardada" : "pendiente"}
      action={enviar}
      className="mt-10 space-y-3"
    >
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

      <label className="block text-sm text-neutral-700">
        Quién recibe
        <input
          type="text"
          name="destinatario"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Teléfono
        <input
          type="tel"
          name="telefono"
          required
          placeholder="4042 8790"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Departamento
        <select
          name="departamentoCodigo"
          required
          value={departamentoCodigo}
          onChange={(e) => {
            setDepartamentoCodigo(e.target.value);
            setMunicipioCodigo("");
            setZonaCapitalina("");
          }}
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="">Selecciona un departamento</option>
          {deptosOrdenados.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="departamento" value={departamentoNombre} />

      <label className="block text-sm text-neutral-700">
        Municipio
        <select
          name="municipioCodigo"
          required
          disabled={!departamentoCodigo}
          value={municipioCodigo}
          onChange={(e) => {
            setMunicipioCodigo(e.target.value);
            setZonaCapitalina("");
          }}
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100 disabled:text-neutral-400"
        >
          <option value="">
            {departamentoCodigo
              ? "Selecciona un municipio"
              : "Selecciona primero un departamento"}
          </option>
          {municipiosDisponibles.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nombre}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="municipio" value={municipioNombre} />

      {esMunicipioGuatemala ? (
        <label className="block text-sm text-neutral-700">
          Zona capitalina
          <select
            name="zonaCapitalina"
            required
            value={zonaCapitalina}
            onChange={(e) => setZonaCapitalina(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Selecciona la zona</option>
            {ZONAS_CAPITALINAS_VALIDAS.map((z) => (
              <option key={z} value={z}>
                Zona {z}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-sm text-neutral-700">
        Dirección
        <input
          type="text"
          name="direccion"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

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
