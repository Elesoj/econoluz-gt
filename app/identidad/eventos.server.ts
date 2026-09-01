import "server-only";

import { leer, registrar } from "../lib/datos";
import {
  MINUTOS_DE_VENTANA,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
  type EventoDeAutenticacion,
} from "./eventos";
import { huellaDeIp } from "./huella";

/** Registrar el evento no puede tumbar un acceso ya autenticado. */
export async function registrarEvento(
  evento: Omit<EventoDeAutenticacion, "pimienta">,
): Promise<void> {
  try {
    await leer(
      SQL_REGISTRAR_EVENTO,
      parametrosDeEvento({
        ...evento,
        pimienta: process.env.AUTH_EVENT_IP_PEPPER,
      }),
    );
  } catch {
    registrar("error", "identidad-evento-no-registrado", { tipo: evento.tipo });
  }
}

/** Si no puede comprobarse el límite, no se bloquea a quien entra de buena fe. */
export async function demasiadosFallosRecientes(ip: string | null): Promise<boolean> {
  const huella = huellaDeIp(ip, process.env.AUTH_EVENT_IP_PEPPER);
  if (!huella) {
    return false;
  }

  try {
    const filas = await leer<Record<string, unknown>>(SQL_CONTAR_FALLOS, [
      huella,
      String(MINUTOS_DE_VENTANA),
    ]);
    return hayDemasiadosFallos(filas);
  } catch {
    return false;
  }
}
