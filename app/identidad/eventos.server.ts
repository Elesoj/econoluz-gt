import "server-only";

import { leer, registrar } from "../lib/datos";
import {
  MINUTOS_DE_VENTANA,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
  politicaDeLimite,
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

/**
 * `true` significa «no dejes pasar este intento».
 *
 * Cuando **no se puede** comprobar el límite, la decisión no se improvisa aquí: la toma
 * `politicaDeLimite`, que está probada, y que en producción sin pimienta **bloquea** en vez
 * de dejar pasar. Antes esta función devolvía `false` en silencio y una variable sin poner
 * desactivaba la protección entera sin dejar rastro.
 *
 * Un fallo de la base de datos sí deja pasar, y eso es deliberado: es un problema
 * transitorio y ajeno a la configuración, y cerrar el acceso de clientes cada vez que Neon
 * tosa sería peor que el riesgo que evita. Queda registrado como error.
 */
export async function demasiadosFallosRecientes(ip: string | null): Promise<boolean> {
  const pimienta = process.env.AUTH_EVENT_IP_PEPPER;
  const politica = politicaDeLimite({
    hayPimienta: Boolean(pimienta),
    hayIp: Boolean(ip),
    produccion: process.env.NODE_ENV === "production",
  });

  if (politica.accion === "bloquear") {
    registrar("error", politica.suceso, {
      efecto: "se rechaza el intento: sin AUTH_EVENT_IP_PEPPER no hay limite de intentos",
    });
    return true;
  }

  if (politica.accion === "permitir") {
    registrar(politica.nivel, politica.suceso, { efecto: "el intento pasa sin limitar" });
    return false;
  }

  try {
    const filas = await leer<Record<string, unknown>>(SQL_CONTAR_FALLOS, [
      huellaDeIp(ip, pimienta),
      String(MINUTOS_DE_VENTANA),
    ]);
    return hayDemasiadosFallos(filas);
  } catch {
    registrar("error", "identidad-limite-no-consultable", { efecto: "el intento pasa sin limitar" });
    return false;
  }
}
