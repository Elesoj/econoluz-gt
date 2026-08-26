"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "../lib/formatters";

const daysPerMonth = 30;
const monthsPerYear = 12;

// El formulario arranca vacío a propósito: cada dato lo introduce el cliente.
// Los valores viven como texto para que el input pueda quedarse en blanco, algo
// que un `number` no permite sin inventarse un cero.
const emptyForm = {
  fixtures: "",
  currentWattage: "",
  ledWattage: "",
  dailyHours: "",
  electricityCost: "",
};

type FormField = keyof typeof emptyForm;

const parseField = (value: string) => {
  const parsedValue = Number(value);

  return value.trim() !== "" && Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
};

// Marcador para los resultados mientras falte algún dato.
const pendingResult = "—";

export default function LedSavingsCalculator() {
  const [form, setForm] = useState(emptyForm);

  const updateField = (field: FormField, value: string) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const results = useMemo(() => {
    const fixtures = parseField(form.fixtures);
    const currentWattage = parseField(form.currentWattage);
    const ledWattage = parseField(form.ledWattage);
    const dailyHours = parseField(form.dailyHours);
    const electricityCost = parseField(form.electricityCost);

    if (
      fixtures === null ||
      currentWattage === null ||
      ledWattage === null ||
      dailyHours === null ||
      electricityCost === null
    ) {
      // Falta algún dato: preferimos no enseñar un cálculo a medias.
      return null;
    }

    const currentMonthlyConsumption =
      (fixtures * currentWattage * dailyHours * daysPerMonth) / 1000;
    const ledMonthlyConsumption = (fixtures * ledWattage * dailyHours * daysPerMonth) / 1000;
    const monthlySavings = Math.max(
      0,
      (currentMonthlyConsumption - ledMonthlyConsumption) * electricityCost,
    );
    const yearlySavings = monthlySavings * monthsPerYear;
    const percentageReduction =
      currentMonthlyConsumption > 0
        ? Math.max(
            0,
            ((currentMonthlyConsumption - ledMonthlyConsumption) / currentMonthlyConsumption) *
              100,
          )
        : 0;

    return {
      fixtures,
      currentWattage,
      ledWattage,
      dailyHours,
      electricityCost,
      currentMonthlyConsumption,
      ledMonthlyConsumption,
      monthlySavings,
      yearlySavings,
      percentageReduction,
    };
  }, [form]);

  const saveResultsForQuote = () => {
    if (!results) {
      return;
    }

    const summary = [
      "Resultados de calculadora LED:",
      `Cantidad de luminarias: ${results.fixtures}`,
      `Consumo actual: ${results.currentWattage} W`,
      `Consumo LED estimado: ${results.ledWattage} W`,
      `Uso diario: ${results.dailyHours} horas`,
      `Costo por kWh: ${formatCurrency(results.electricityCost)}`,
      `Consumo mensual actual: ${formatNumber(results.currentMonthlyConsumption)} kWh`,
      `Consumo mensual LED: ${formatNumber(results.ledMonthlyConsumption)} kWh`,
      `Ahorro mensual estimado: ${formatCurrency(results.monthlySavings)}`,
      `Ahorro anual estimado: ${formatCurrency(results.yearlySavings)}`,
      `Reducción estimada: ${formatNumber(results.percentageReduction)}%`,
    ].join("\n");

    window.localStorage.setItem(
      "econoluz_led_results",
      JSON.stringify({
        summary,
        ...results,
      }),
    );
  };

  const fields: {
    name: FormField;
    label: string;
    min: number;
    max?: number;
    step: number;
    suffix: string;
  }[] = [
    {
      name: "fixtures",
      label: "Cantidad de luminarias",
      min: 1,
      step: 1,
      suffix: "unidades",
    },
    {
      name: "currentWattage",
      label: "Consumo actual",
      min: 1,
      step: 1,
      suffix: "W",
    },
    {
      name: "ledWattage",
      label: "Consumo LED",
      min: 1,
      step: 1,
      suffix: "W",
    },
    {
      name: "dailyHours",
      label: "Uso diario",
      min: 1,
      max: 24,
      step: 0.5,
      suffix: "horas",
    },
    {
      name: "electricityCost",
      label: "Costo por kWh",
      min: 0.01,
      step: 0.01,
      suffix: "GTQ",
    },
  ];

  return (
    <div className="grid gap-8">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="border border-neutral-200 bg-white p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tienda">
            Datos del proyecto
          </p>

          <div className="mt-6 grid gap-5">
            {fields.map((field) => (
              <label key={field.name} className="grid gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold">{field.label}</span>
                  <span className="text-sm text-neutral-500">{field.suffix}</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={form[field.name]}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  className="border border-neutral-200 px-4 py-3 text-lg font-semibold outline-none transition focus:border-proyectos"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              {
                label: "Consumo mensual actual",
                value: results
                  ? `${formatNumber(results.currentMonthlyConsumption)} kWh`
                  : pendingResult,
              },
              {
                label: "Consumo mensual LED",
                value: results
                  ? `${formatNumber(results.ledMonthlyConsumption)} kWh`
                  : pendingResult,
              },
              {
                label: "Ahorro mensual estimado",
                value: results ? formatCurrency(results.monthlySavings) : pendingResult,
              },
              {
                label: "Ahorro anual estimado",
                value: results ? formatCurrency(results.yearlySavings) : pendingResult,
              },
            ].map((result) => (
              <article
                key={result.label}
                className="border border-neutral-200 p-6 transition duration-300 hover:border-proyectos"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tienda">
                  {result.label}
                </p>
                <p className="mt-4 text-3xl font-semibold leading-none">{result.value}</p>
              </article>
            ))}
          </div>

          <article className="bg-proyectos p-7 text-white">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/46">
                  Reducción estimada
                </p>
                <p className="mt-4 text-6xl font-semibold leading-none">
                  {results ? `${formatNumber(results.percentageReduction)}%` : pendingResult}
                </p>
              </div>
              <p className="max-w-md leading-7 text-white/66">
                {results
                  ? "Este cálculo es una referencia inicial. El ahorro real puede variar según tarifa, horarios, producto seleccionado y condiciones del proyecto."
                  : "Completa los datos del proyecto para ver el consumo, el ahorro estimado y la reducción."}
              </p>
            </div>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/14">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${results ? Math.min(results.percentageReduction, 100) : 0}%` }}
              />
            </div>
          </article>
        </div>
      </div>

      <div className="grid gap-6 border border-neutral-200 bg-white p-6 transition duration-300 hover:border-proyectos sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tienda">
            Siguiente paso
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            Solicitar asesoría con estos resultados
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-neutral-600">
            Guarda este cálculo y completa una solicitud de proyecto para revisar
            cantidades, temperaturas, ópticas y productos adecuados.
          </p>
          {!results && (
            <p id="led-cta-help" className="mt-4 text-sm font-semibold text-tienda">
              Completa los cinco datos del proyecto para solicitar la asesoría.
            </p>
          )}
        </div>
        {results ? (
          <Link
            href="/asesoria"
            onClick={saveResultsForQuote}
            className="inline-flex w-full items-center justify-center rounded-full bg-tienda px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-tienda-fuerte sm:w-auto"
          >
            Solicitar asesoría
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-describedby="led-cta-help"
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-neutral-200 px-7 py-4 text-sm font-semibold text-neutral-500 sm:w-auto"
          >
            Solicitar asesoría
          </button>
        )}
      </div>
    </div>
  );
}
