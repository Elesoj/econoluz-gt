// app/admin/envios/tarifas.server.ts
//
// SIN CONSUMIDORES desde la corrección del modelo operativo de envíos (04/09/2026).
// Pertenece al modelo de zonas de reparto y tarifas por tramos del subproyecto 9A,
// derogado por `docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md`.
// Se conserva sin borrar, como las tablas `shipping_zones`, `shipping_zone_areas` y
// `shipping_rates`, por si hiciera falta para auditoría histórica o recuperación.
// **No volver a importarlo**: el cálculo vigente es `app/envios/orquestacion.ts`.
import "server-only";

import { updateTag } from "next/cache";
import { escribir, registrar } from "../../lib/datos";
import { validarTarifa } from "../../envios/validacion";
import {
  SQL_AUDITAR,
  SQL_BLOQUEAR_TARIFA_VIGENTE,
  SQL_CERRAR_TARIFA,
  SQL_INSERTAR_TARIFA,
} from "./tarifas";

export type TarifaInput = {
  importeCents: number;
  umbralGratisCents: number | null;
  maxPiezas: number | null;
  maxImporteCents: number | null;
  plazoMinDias: number;
  plazoMaxDias: number;
};

export type ResultadoPublicarTarifa =
  | { ok: true; tarifaId: number }
  | { ok: false; error: string };

/**
 * Publica una nueva tarifa para una zona según la secuencia §6.4 del diseño:
 * 1. Bloquea la tarifa vigente actual (o zona) con FOR UPDATE.
 * 2. Cierra la vigente estableciendo vigente_hasta = ahora.
 * 3. Inserta la nueva tarifa publicada abierta (vigente_desde = ahora, vigente_hasta = null).
 * 4. Audita dentro de la MISMA transacción con entidad 'shipping_rate'.
 * Tras el COMMIT, invalida la caché "envios-tarifas". Si falla, registra sólo escalares.
 */
export async function publicarTarifaEnBase(
  zoneId: number,
  datos: TarifaInput,
  actorId: string,
): Promise<ResultadoPublicarTarifa> {
  const validacion = validarTarifa(datos);
  if (!validacion.ok) {
    return { ok: false, error: validacion.error };
  }

  let tarifaCreadaId = 0;

  await escribir(
    async (ejecutar) => {
      // 1. Bloquear: serializa sustituciones concurrentes sobre la zona y su tarifa vigente.
      // Primero bloqueamos la fila de la zona para garantizar serialización incluso si aún no hay tarifas.
      await ejecutar("select id from shipping_zones where id = $1 for update", [zoneId]);
      const filasAhora = (await ejecutar("select now() as ahora")) as { ahora: Date | string }[];
      const ahora = filasAhora[0]?.ahora ?? new Date();

      const vigentes = (await ejecutar(SQL_BLOQUEAR_TARIFA_VIGENTE, [zoneId])) as {
        id: number | string;
        importe_cents: number;
        umbral_gratis_cents: number | null;
        max_piezas: number | null;
        max_importe_cents: number | null;
        plazo_min_dias: number;
        plazo_max_dias: number;
        publicada: boolean;
        vigente_desde: string | Date;
        vigente_hasta: string | Date | null;
      }[];

      const anterior = vigentes[0] ?? null;

      // 2. Cerrar la tarifa anterior si existe
      if (anterior) {
        await ejecutar(SQL_CERRAR_TARIFA, [anterior.id, ahora]);
      }

      // 3. Insertar la nueva tarifa publicada abierta
      const nuevas = (await ejecutar(SQL_INSERTAR_TARIFA, [
        zoneId,
        datos.importeCents,
        datos.umbralGratisCents,
        datos.maxPiezas,
        datos.maxImporteCents,
        datos.plazoMinDias,
        datos.plazoMaxDias,
        ahora,
      ])) as {
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
      }[];

      const nueva = nuevas[0];
      if (!nueva) {
        throw new Error("No se pudo insertar la tarifa de envío");
      }

      tarifaCreadaId = Number(nueva.id);

      // 4. Auditar dentro de la MISMA transacción
      await ejecutar(SQL_AUDITAR, [
        actorId,
        String(nueva.id),
        anterior ? JSON.stringify(anterior) : null,
        JSON.stringify(nueva),
      ]);
    },
    { suceso: "publicar-tarifa" },
  );

  // Fuera de la transacción: la invalidación de caché no forma parte de la transacción
  try {
    updateTag("envios-tarifas");
  } catch (error) {
    registrar("error", "cache-envios-no-invalidada", {
      clase: error instanceof Error ? error.constructor.name : "desconocida",
    });
  }

  return { ok: true, tarifaId: tarifaCreadaId };
}
