// app/admin/envios/tarifas.ts
//
// SIN CONSUMIDORES desde la corrección del modelo operativo de envíos (04/09/2026).
// Pertenece al modelo de zonas de reparto y tarifas por tramos del subproyecto 9A,
// derogado por `docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md`.
// Se conserva sin borrar, como las tablas `shipping_zones`, `shipping_zone_areas` y
// `shipping_rates`, por si hiciera falta para auditoría histórica o recuperación.
// **No volver a importarlo**: el cálculo vigente es `app/envios/orquestacion.ts`.
// Módulo funcional puro (sin server-only) que define la secuencia estricta de pasos
// para la sustitución de tarifas según §6.4 del diseño.

export type PasoTransaccion = {
  tipo: "bloquear" | "cerrar" | "insertar" | "auditar";
  sql: string;
  descripcion: string;
};

export const SQL_BLOQUEAR_TARIFA_VIGENTE =
  "select id from shipping_rates where zone_id = $1 and publicada = true and (vigente_hasta is null or vigente_hasta > now()) for update";

export const SQL_CERRAR_TARIFA =
  "update shipping_rates set vigente_hasta = $2 where id = $1";

export const SQL_INSERTAR_TARIFA =
  "insert into shipping_rates (zone_id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents, plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta) values ($1, $2, $3, $4, $5, $6, $7, true, $8, null) returning id, zone_id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents, plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta";

export const SQL_AUDITAR =
  "insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues) values ('admin', $1, 'publicar', 'shipping_rate', $2, $3::jsonb, $4::jsonb)";

/**
 * Retorna la secuencia ordenada de los 4 pasos transaccionales para sustituir una tarifa.
 * La invalidación de caché (updateTag) NO forma parte de esta transacción.
 */
export function pasosDeSustitucion(): readonly PasoTransaccion[] {
  return [
    {
      tipo: "bloquear",
      sql: SQL_BLOQUEAR_TARIFA_VIGENTE,
      descripcion: "Bloquea la tarifa vigente actual con FOR UPDATE para serializar escrituras concurrentes.",
    },
    {
      tipo: "cerrar",
      sql: SQL_CERRAR_TARIFA,
      descripcion: "Cierra la vigencia de la tarifa anterior en el instante de cambio.",
    },
    {
      tipo: "insertar",
      sql: SQL_INSERTAR_TARIFA,
      descripcion: "Inserta la nueva tarifa publicada y abierta en ese mismo instante.",
    },
    {
      tipo: "auditar",
      sql: SQL_AUDITAR,
      descripcion: "Inserta en audit_log dentro de la misma transacción.",
    },
  ] as const;
}
