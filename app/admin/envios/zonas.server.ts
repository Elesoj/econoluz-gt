// app/admin/envios/zonas.server.ts
"server-only";

import { leer } from "../../lib/datos";

export type TarifaResumen = {
  id: number;
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

export type ZonaAdminListado = {
  id: number;
  codigo: string;
  nombre: string;
  metodo: "mensajero_propio" | "paqueteria";
  activa: boolean;
  notas: string;
  totalDepartamentos: number;
  totalMunicipios: number;
  tarifaVigente: TarifaResumen | null;
  calculaEnvio: boolean;
  motivoEstado: string;
};

/**
 * Obtiene la lista de zonas configuradas con sus áreas asignadas,
 * su tarifa publicada vigente y su estado deducido según §6.3 del diseño.
 */
export async function obtenerZonasAdmin(): Promise<ZonaAdminListado[]> {
  const [zonasFilas, areasFilas, tarifasFilas] = await Promise.all([
    leer<{
      id: number | string;
      codigo: string;
      nombre: string;
      metodo: string;
      activa: boolean;
      notas: string;
    }>(
      `select id, codigo, nombre, metodo, activa, notas
         from shipping_zones
        order by id asc`,
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
      `select id, zone_id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents,
              plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta
         from shipping_rates
        where publicada = true
        order by vigente_desde desc`,
    ),
  ]);

  const ahoraMs = Date.now();

  return zonasFilas.map((z) => {
    const zoneId = Number(z.id);
    const areasZona = areasFilas.filter((a) => Number(a.zone_id) === zoneId);
    const deptosActivos = areasZona.filter((a) => a.departamento_codigo !== null && a.activa);
    const munActivos = areasZona.filter((a) => a.municipio_codigo !== null && a.activa);
    const tieneCobertura = deptosActivos.length > 0 || munActivos.length > 0;

    // Buscar tarifa publicada vigente
    const tarifasZona = tarifasFilas.filter((t) => Number(t.zone_id) === zoneId);
    let tarifaVigente: TarifaResumen | null = null;

    for (const t of tarifasZona) {
      const desdeMs = new Date(t.vigente_desde).getTime();
      const hastaMs = t.vigente_hasta ? new Date(t.vigente_hasta).getTime() : Infinity;
      if (ahoraMs >= desdeMs && ahoraMs < hastaMs) {
        tarifaVigente = {
          id: Number(t.id),
          importeCents: Number(t.importe_cents),
          umbralGratisCents: t.umbral_gratis_cents !== null ? Number(t.umbral_gratis_cents) : null,
          maxPiezas: t.max_piezas !== null ? Number(t.max_piezas) : null,
          maxImporteCents: t.max_importe_cents !== null ? Number(t.max_importe_cents) : null,
          plazoMinDias: Number(t.plazo_min_dias),
          plazoMaxDias: Number(t.plazo_max_dias),
          publicada: Boolean(t.publicada),
          vigenteDesde: new Date(t.vigente_desde),
          vigenteHasta: t.vigente_hasta ? new Date(t.vigente_hasta) : null,
        };
        break;
      }
    }

    // Deducción del estado (§6.3)
    let calculaEnvio = false;
    let motivoEstado = "Calcula envío";

    if (!z.activa) {
      calculaEnvio = false;
      motivoEstado = "Zona desactivada";
    } else if (!tieneCobertura) {
      calculaEnvio = false;
      motivoEstado = "Sin cobertura asignada";
    } else if (!tarifaVigente) {
      calculaEnvio = false;
      motivoEstado = "Sin tarifa publicada vigente";
    } else {
      calculaEnvio = true;
      motivoEstado = "Calcula envío";
    }

    return {
      id: zoneId,
      codigo: z.codigo.trim(),
      nombre: z.nombre.trim(),
      metodo: z.metodo as "mensajero_propio" | "paqueteria",
      activa: Boolean(z.activa),
      notas: (z.notas ?? "").trim(),
      totalDepartamentos: deptosActivos.length,
      totalMunicipios: munActivos.length,
      tarifaVigente,
      calculaEnvio,
      motivoEstado,
    };
  });
}
