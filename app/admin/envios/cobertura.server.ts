// app/admin/envios/cobertura.server.ts
//
// SIN CONSUMIDORES desde la corrección del modelo operativo de envíos (04/09/2026).
// Pertenece al modelo de zonas de reparto y tarifas por tramos del subproyecto 9A,
// derogado por `docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md`.
// Se conserva sin borrar, como las tablas `shipping_zones`, `shipping_zone_areas` y
// `shipping_rates`, por si hiciera falta para auditoría histórica o recuperación.
// **No volver a importarlo**: el cálculo vigente es `app/envios/orquestacion.ts`.
"server-only";

import { leer } from "../../lib/datos";
import {
  resumirCobertura,
  type ResumenDepartamento,
} from "./cobertura";
import type { Cobertura } from "../../envios/zonas";

export type EstadisticasCobertura = {
  totalDepartamentos: number;
  completos: number;
  parciales: number;
  sinCobertura: number;
  totalMunicipios: number;
  municipiosCubiertos: number;
};

export type ResumenCoberturaPais = {
  departamentos: ResumenDepartamento[];
  estadisticas: EstadisticasCobertura;
};

/**
 * Consulta la base de datos y resume la cobertura nacional en tres estados:
 * "completa", "parcial" y "sin_cobertura".
 *
 * Utiliza `resumirCobertura` evaluando cada municipio con la misma función pura
 * que resuelve el destino durante el cálculo de envíos.
 */
export async function obtenerResumenCoberturaPais(): Promise<ResumenCoberturaPais> {
  const [deptosFilas, munFilas, areasFilas, zonasFilas, tarifasFilas] = await Promise.all([
    leer<{ codigo: string; nombre: string }>(
      `select codigo, nombre
         from geo_departamentos
        order by codigo asc`,
    ),
    leer<{ codigo: string; departamento_codigo: string; nombre: string }>(
      `select codigo, departamento_codigo, nombre
         from geo_municipios
        order by codigo asc`,
    ),
    leer<{
      zone_id: number | string;
      departamento_codigo: string | null;
      municipio_codigo: string | null;
      activa: boolean;
    }>(
      `select zone_id, departamento_codigo, municipio_codigo, activa
         from shipping_zone_areas`,
    ),
    leer<{
      id: number | string;
      codigo: string;
      nombre: string;
      metodo: string;
      activa: boolean;
    }>(
      `select id, codigo, nombre, metodo, activa
         from shipping_zones
        order by id asc`,
    ),
    leer<{
      zone_id: number | string;
      importe_cents: number;
      umbral_gratis_cents: number | null;
      max_piezas: number | null;
      max_importe_cents: number | null;
      plazo_min_dias: number;
      plazo_max_dias: number;
      publicada: boolean;
      vigente_desde: string | Date;
      vigente_hasta: string | Date | null;
    }>(
      `select zone_id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents,
              plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta
         from shipping_rates
        where publicada = true`,
    ),
  ]);

  const nombresDeptos = new Map<string, string>();
  for (const d of deptosFilas) {
    nombresDeptos.set(d.codigo.trim(), d.nombre.trim());
  }

  const municipios = munFilas.map((m) => {
    const depCodigo = m.departamento_codigo.trim();
    return {
      codigo: m.codigo.trim(),
      departamento: depCodigo,
      departamentoCodigo: depCodigo,
      nombre: m.nombre.trim(),
      departamentoNombre: nombresDeptos.get(depCodigo) ?? depCodigo,
    };
  });

  const cobertura: Cobertura[] = areasFilas.map((a) => ({
    zoneId: Number(a.zone_id),
    departamentoCodigo: a.departamento_codigo ? a.departamento_codigo.trim() : null,
    municipioCodigo: a.municipio_codigo ? a.municipio_codigo.trim() : null,
    activa: Boolean(a.activa),
  }));

  const zonas = zonasFilas.map((z) => ({
    id: Number(z.id),
    codigo: z.codigo.trim(),
    nombre: z.nombre.trim(),
    metodo: z.metodo.trim(),
    activa: Boolean(z.activa),
  }));

  const tarifas = tarifasFilas.map((t) => ({
    zoneId: Number(t.zone_id),
    publicada: Boolean(t.publicada),
    vigenteDesde: t.vigente_desde instanceof Date ? t.vigente_desde : new Date(t.vigente_desde),
    vigenteHasta: t.vigente_hasta
      ? t.vigente_hasta instanceof Date
        ? t.vigente_hasta
        : new Date(t.vigente_hasta)
      : null,
  }));

  const departamentos = resumirCobertura(municipios, cobertura, zonas, tarifas);

  let completos = 0;
  let parciales = 0;
  let sinCobertura = 0;
  let municipiosCubiertos = 0;

  for (const d of departamentos) {
    if (d.estado === "completa") completos += 1;
    else if (d.estado === "parcial") parciales += 1;
    else sinCobertura += 1;

    municipiosCubiertos += d.municipiosCubiertos;
  }

  const estadisticas: EstadisticasCobertura = {
    totalDepartamentos: departamentos.length,
    completos,
    parciales,
    sinCobertura,
    totalMunicipios: municipios.length,
    municipiosCubiertos,
  };

  return {
    departamentos,
    estadisticas,
  };
}
