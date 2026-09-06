// app/envios/tarifas.ts
//
// Cálculo operativo del envío, en centavos enteros y sin acceso a nada externo.
//
// Sustituye al cálculo por tramos de 9A: hoy solo hay dos caminos, el mensajero
// propio —con tarifa fija y umbral de gratuidad— y Guatex, cuyo coste depende del
// peso del pedido y no se conoce desde la web.

import type {
  MetodoEnvioOperativo,
  ResultadoDeEnvioBase,
} from "./contratos";

export const TARIFA_MENSAJERO_DEFECTO_CENTS = 3500;
export const UMBRAL_GRATIS_DEFECTO_CENTS = 250000;

export type ReglasPropias = { tarifaCents: number; umbralGratisCents: number };

export const REGLAS_PROPIAS_DEFECTO: ReglasPropias = {
  tarifaCents: TARIFA_MENSAJERO_DEFECTO_CENTS,
  umbralGratisCents: UMBRAL_GRATIS_DEFECTO_CENTS,
};

/**
 * La comparación del umbral es **inclusiva**: Q2.499,99 paga la tarifa y
 * Q2.500,00 exactos no paga envío.
 */
export function calcularTarifaMensajeroPropio(
  subtotalCents: number,
  reglas: ReglasPropias = REGLAS_PROPIAS_DEFECTO,
): { envioCents: number; gratuito: boolean; faltanParaGratisCents: number | null } {
  if (subtotalCents >= reglas.umbralGratisCents) {
    return { envioCents: 0, gratuito: true, faltanParaGratisCents: 0 };
  }
  return {
    envioCents: reglas.tarifaCents,
    gratuito: false,
    faltanParaGratisCents: Math.max(0, reglas.umbralGratisCents - subtotalCents),
  };
}

export function calcularEnvioOperativo(params: {
  metodo: MetodoEnvioOperativo;
  subtotalCents: number;
  reglas?: ReglasPropias;
}): Extract<ResultadoDeEnvioBase, { tipo: "calculado" | "solicitud_contacto" }> {
  if (params.metodo === "guatex") {
    // Coste desconocido, no gratuito. Cero sería una promesa que no podemos cumplir.
    return {
      tipo: "solicitud_contacto",
      metodo: "guatex",
      envioCents: null,
      gratuito: false,
      faltanParaGratisCents: null,
    };
  }
  const calculo = calcularTarifaMensajeroPropio(params.subtotalCents, params.reglas);
  return {
    tipo: "calculado",
    metodo: "mensajero_propio",
    ...calculo,
  };
}
