"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "../lib/formatters";

const daysPerMonth = 30;
const monthsPerYear = 12;

export default function LedSavingsCalculator() {
  const [fixtures, setFixtures] = useState(24);
  const [currentWattage, setCurrentWattage] = useState(60);
  const [ledWattage, setLedWattage] = useState(12);
  const [dailyHours, setDailyHours] = useState(8);
  const [electricityCost, setElectricityCost] = useState(1.45);

  const results = useMemo(() => {
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
      currentMonthlyConsumption,
      ledMonthlyConsumption,
      monthlySavings,
      yearlySavings,
      percentageReduction,
    };
  }, [currentWattage, dailyHours, electricityCost, fixtures, ledWattage]);

  const saveResultsForQuote = () => {
    const summary = [
      "Resultados de calculadora LED:",
      `Cantidad de luminarias: ${fixtures}`,
      `Consumo actual: ${currentWattage} W`,
      `Consumo LED estimado: ${ledWattage} W`,
      `Uso diario: ${dailyHours} horas`,
      `Costo por kWh: ${formatCurrency(electricityCost)}`,
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
        fixtures,
        currentWattage,
        ledWattage,
        dailyHours,
        electricityCost,
        ...results,
      }),
    );
  };

  const fields = [
    {
      label: "Cantidad de luminarias",
      value: fixtures,
      onChange: setFixtures,
      min: 1,
      step: 1,
      suffix: "unidades",
    },
    {
      label: "Consumo actual",
      value: currentWattage,
      onChange: setCurrentWattage,
      min: 1,
      step: 1,
      suffix: "W",
    },
    {
      label: "Consumo LED",
      value: ledWattage,
      onChange: setLedWattage,
      min: 1,
      step: 1,
      suffix: "W",
    },
    {
      label: "Uso diario",
      value: dailyHours,
      onChange: setDailyHours,
      min: 1,
      max: 24,
      step: 0.5,
      suffix: "horas",
    },
    {
      label: "Costo por kWh",
      value: electricityCost,
      onChange: setElectricityCost,
      min: 0.01,
      step: 0.01,
      suffix: "GTQ",
    },
  ];

  return (
    <div className="grid gap-8">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="border border-neutral-200 bg-white p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Datos del proyecto
          </p>

          <div className="mt-6 grid gap-5">
            {fields.map((field) => (
              <label key={field.label} className="grid gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold">{field.label}</span>
                  <span className="text-sm text-neutral-500">{field.suffix}</span>
                </div>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={field.value}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                  className="border border-neutral-200 px-4 py-3 text-lg font-semibold outline-none transition focus:border-black"
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
                value: `${formatNumber(results.currentMonthlyConsumption)} kWh`,
              },
              {
                label: "Consumo mensual LED",
                value: `${formatNumber(results.ledMonthlyConsumption)} kWh`,
              },
              {
                label: "Ahorro mensual estimado",
                value: formatCurrency(results.monthlySavings),
              },
              {
                label: "Ahorro anual estimado",
                value: formatCurrency(results.yearlySavings),
              },
            ].map((result) => (
              <article
                key={result.label}
                className="border border-neutral-200 p-6 transition duration-300 hover:border-black"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  {result.label}
                </p>
                <p className="mt-4 text-3xl font-semibold leading-none">{result.value}</p>
              </article>
            ))}
          </div>

          <article className="bg-black p-7 text-white">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/46">
                  Reducción estimada
                </p>
                <p className="mt-4 text-6xl font-semibold leading-none">
                  {formatNumber(results.percentageReduction)}%
                </p>
              </div>
              <p className="max-w-md leading-7 text-white/66">
                Este cálculo es una referencia inicial. El ahorro real puede variar según tarifa,
                horarios, producto seleccionado y condiciones del proyecto.
              </p>
            </div>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/14">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${Math.min(results.percentageReduction, 100)}%` }}
              />
            </div>
          </article>
        </div>
      </div>

      <div className="grid gap-6 border border-neutral-200 bg-white p-6 transition duration-300 hover:border-black sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Siguiente paso
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            Solicitar asesoría con estos resultados
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-neutral-600">
            Guarda este cálculo y completa una solicitud de proyecto para revisar
            cantidades, temperaturas, ópticas y productos adecuados.
          </p>
        </div>
        <Link
          href="/catalogo#asesoria-proyecto"
          onClick={saveResultsForQuote}
          className="inline-flex w-full items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800 sm:w-auto"
        >
          Solicitar asesoría
        </Link>
      </div>
    </div>
  );
}
