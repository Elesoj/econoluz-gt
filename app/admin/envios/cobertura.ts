// app/admin/envios/cobertura.ts
//
// SIN CONSUMIDORES desde la corrección del modelo operativo de envíos (04/09/2026).
// Pertenece al modelo de zonas de reparto y tarifas por tramos del subproyecto 9A,
// derogado por `docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md`.
// Se conserva sin borrar, como las tablas `shipping_zones`, `shipping_zone_areas` y
// `shipping_rates`, por si hiciera falta para auditoría histórica o recuperación.
// **No volver a importarlo**: el cálculo vigente es `app/envios/orquestacion.ts`.

import { resolverZona, type Cobertura } from "../../envios/zonas";

export type MunicipioParaCobertura = {
  codigo: string;
  departamento?: string;
  departamentoCodigo?: string;
  nombre: string;
  departamentoNombre?: string;
};

export type ZonaParaCobertura = {
  id: number;
  activa: boolean;
  [key: string]: unknown;
};

export type TarifaParaCobertura = {
  zoneId: number;
  publicada: boolean;
  vigenteDesde?: Date | string;
  vigenteHasta?: Date | string | null;
  [key: string]: unknown;
};

export type EstadoCobertura = "completa" | "parcial" | "sin_cobertura";

export type ResumenDepartamento = {
  codigo: string;
  nombre: string;
  estado: EstadoCobertura;
  municipiosExcluidos: string[];
  totalMunicipios: number;
  municipiosCubiertos: number;
};

export const NOMBRES_DEPARTAMENTOS_GT: Record<string, string> = {
  "01": "Guatemala",
  "02": "El Progreso",
  "03": "Sacatepéquez",
  "04": "Chimaltenango",
  "05": "Escuintla",
  "06": "Santa Rosa",
  "07": "Sololá",
  "08": "Totonicapán",
  "09": "Quetzaltenango",
  "10": "Suchitepéquez",
  "11": "Retalhuleu",
  "12": "San Marcos",
  "13": "Huehuetenango",
  "14": "Quiché",
  "15": "Baja Verapaz",
  "16": "Alta Verapaz",
  "17": "Petén",
  "18": "Izabal",
  "19": "Zacapa",
  "20": "Chiquimula",
  "21": "Jalapa",
  "22": "Jutiapa",
};

/**
 * Resumen puro de cobertura geográfica a nivel departamental.
 *
 * Evalúa municipio a municipio con `resolverZona` para asegurar paridad
 * absoluta con el cálculo de pedidos. Un municipio calcula envío si resuelve
 * a una zona activa que cuenta con al menos una tarifa publicada y vigente.
 *
 * Agrupa por departamento en tres estados:
 * - "completa": todos sus municipios calculan envío.
 * - "sin_cobertura": ningún municipio calcula envío.
 * - "parcial": algunos calculan y otros no; lista los nombres excluidos.
 */
export function resumirCobertura(
  municipios: readonly MunicipioParaCobertura[],
  cobertura: readonly Cobertura[],
  zonas: readonly ZonaParaCobertura[],
  tarifas: readonly TarifaParaCobertura[],
  opciones?: { ahora?: Date },
): ResumenDepartamento[] {
  const zonasMap = new Map<number, boolean>();
  for (const z of zonas) {
    zonasMap.set(Number(z.id), Boolean(z.activa));
  }

  const ahora = opciones?.ahora ?? new Date();
  const ahoraMs = ahora.getTime();

  // Conjunto de IDs de zona con tarifa publicada y vigente
  const zonasConTarifa = new Set<number>();
  for (const t of tarifas) {
    if (!t.publicada) continue;
    if (t.vigenteDesde !== undefined || t.vigenteHasta !== undefined) {
      const desdeMs = t.vigenteDesde ? new Date(t.vigenteDesde).getTime() : 0;
      const hastaMs = t.vigenteHasta ? new Date(t.vigenteHasta).getTime() : Infinity;
      if (ahoraMs < desdeMs || ahoraMs >= hastaMs) {
        continue;
      }
    }
    zonasConTarifa.add(Number(t.zoneId));
  }

  type InfoMunicipio = {
    codigo: string;
    nombre: string;
    calcula: boolean;
  };

  type InfoDepartamento = {
    codigo: string;
    nombre: string;
    municipios: InfoMunicipio[];
  };

  const departamentosMap = new Map<string, InfoDepartamento>();

  for (const m of municipios) {
    const depCodigo = (m.departamentoCodigo ?? m.departamento ?? m.codigo.slice(0, 2)).trim();
    const munCodigo = m.codigo.trim();
    const munNombre = m.nombre.trim();
    const depNombre =
      m.departamentoNombre ?? NOMBRES_DEPARTAMENTOS_GT[depCodigo] ?? depCodigo;

    if (!departamentosMap.has(depCodigo)) {
      departamentosMap.set(depCodigo, {
        codigo: depCodigo,
        nombre: depNombre,
        municipios: [],
      });
    }

    const res = resolverZona(cobertura, {
      departamentoCodigo: depCodigo,
      municipioCodigo: munCodigo,
    });

    let calcula = false;
    if (res.tipo === "zona") {
      const zonaActiva = zonasMap.get(res.zoneId) ?? false;
      const tieneTarifaValida = zonasConTarifa.has(res.zoneId);
      if (zonaActiva && tieneTarifaValida) {
        calcula = true;
      }
    }

    departamentosMap.get(depCodigo)!.municipios.push({
      codigo: munCodigo,
      nombre: munNombre,
      calcula,
    });
  }

  const resultado: ResumenDepartamento[] = [];

  for (const depto of departamentosMap.values()) {
    const total = depto.municipios.length;
    const cubiertos = depto.municipios.filter((m) => m.calcula).length;
    const excluidos = depto.municipios.filter((m) => !m.calcula).map((m) => m.nombre);

    let estado: EstadoCobertura;
    let municipiosExcluidos: string[];

    if (total === 0 || cubiertos === 0) {
      estado = "sin_cobertura";
      municipiosExcluidos = [];
    } else if (cubiertos === total) {
      estado = "completa";
      municipiosExcluidos = [];
    } else {
      estado = "parcial";
      municipiosExcluidos = excluidos;
    }

    resultado.push({
      codigo: depto.codigo,
      nombre: depto.nombre,
      estado,
      municipiosExcluidos,
      totalMunicipios: total,
      municipiosCubiertos: cubiertos,
    });
  }

  return resultado;
}
