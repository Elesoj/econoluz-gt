// app/envios/tarifas.ts

import type { ResultadoDeEnvioBase } from "./contratos";

export type Tarifa = {
  importeCents: number;
  umbralGratisCents: number | null;
  maxPiezas: number | null;
  maxImporteCents: number | null;
  plazoMinDias: number;
  plazoMaxDias: number;
  publicada: boolean;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
};

export type Zona = {
  codigo: string;
  nombre: string;
  metodo: "mensajero_propio" | "paqueteria";
};

export type PedidoCalculo = {
  piezas: number;
  subtotalCents: number;
};

export function estaVigente(tarifa: Tarifa, ahora: Date): boolean {
  if (!tarifa.publicada) {
    return false;
  }
  const tiempo = ahora.getTime();
  const desde = tarifa.vigenteDesde.getTime();
  if (tiempo < desde) {
    return false;
  }
  if (tarifa.vigenteHasta !== null && tiempo >= tarifa.vigenteHasta.getTime()) {
    return false;
  }
  return true;
}

export function calcularEnvio(
  tarifa: Tarifa,
  zona: Zona,
  pedido: PedidoCalculo,
  ahora: Date
): ResultadoDeEnvioBase {
  if (!estaVigente(tarifa, ahora)) {
    return { tipo: "requiere_cotizacion", motivo: "sin_tarifa_vigente" };
  }

  // Paso 7: Límites primero, antes que nada económico.
  if (tarifa.maxPiezas !== null && pedido.piezas > tarifa.maxPiezas) {
    return { tipo: "requiere_cotizacion", motivo: "pedido_grande" };
  }

  if (tarifa.maxImporteCents !== null && pedido.subtotalCents > tarifa.maxImporteCents) {
    return { tipo: "requiere_cotizacion", motivo: "pedido_grande" };
  }

  // Paso 8: Gratuidad.
  const alcanzaGratis =
    tarifa.umbralGratisCents !== null && pedido.subtotalCents >= tarifa.umbralGratisCents;

  if (alcanzaGratis) {
    return {
      tipo: "con_tarifa",
      zonaCodigo: zona.codigo,
      zonaNombre: zona.nombre,
      metodo: zona.metodo,
      envioCents: 0,
      gratuito: true,
      faltanParaGratisCents: 0,
      plazoMinDias: Math.round(tarifa.plazoMinDias),
      plazoMaxDias: Math.round(tarifa.plazoMaxDias),
    };
  }

  // Paso 9: Tarifa normal.
  const faltanParaGratisCents =
    tarifa.umbralGratisCents !== null
      ? Math.max(0, Math.round(tarifa.umbralGratisCents - pedido.subtotalCents))
      : null;

  return {
    tipo: "con_tarifa",
    zonaCodigo: zona.codigo,
    zonaNombre: zona.nombre,
    metodo: zona.metodo,
    envioCents: Math.round(tarifa.importeCents),
    gratuito: false,
    faltanParaGratisCents,
    plazoMinDias: Math.round(tarifa.plazoMinDias),
    plazoMaxDias: Math.round(tarifa.plazoMaxDias),
  };
}
