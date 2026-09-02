import { familiaDeNavegador, huellaDeIp } from "./huella";

/**
 * Quién entró, cuándo y con qué proveedor. Sin datos que identifiquen a nadie
 * más allá de la cuenta: la IP se guarda como huella y del navegador solo su
 * familia.
 */

export type TipoDeEvento = "registro" | "acceso" | "vinculacion" | "borrado" | "fallo";
export type ResultadoDeEvento = "correcto" | "fallido";

export type EventoDeAutenticacion = {
  userId: string | null;
  tipo: TipoDeEvento;
  proveedor: string | null;
  resultado: ResultadoDeEvento;
  ip: string | null;
  userAgent: string | null;
  pimienta: string | undefined;
};

export const SQL_REGISTRAR_EVENTO = `
  insert into auth_events (user_id, tipo, proveedor, resultado, ip_huella, navegador)
  values ($1, $2, $3, $4, $5, $6)
`;

export function parametrosDeEvento(evento: EventoDeAutenticacion) {
  return [
    evento.userId,
    evento.tipo,
    evento.proveedor,
    evento.resultado,
    huellaDeIp(evento.ip, evento.pimienta),
    familiaDeNavegador(evento.userAgent),
  ];
}

/**
 * Firebase limita por cuenta; esto añade la detección de muchos fallos desde
 * la misma huella. No reutiliza `admin_login_attempts`, que pertenece al panel.
 */
export const MAXIMO_DE_FALLOS = 10;
export const MINUTOS_DE_VENTANA = 15;

export const SQL_CONTAR_FALLOS = `
  select count(*)::int as n
  from auth_events
  where ip_huella = $1
    and resultado = 'fallido'
    and ocurrido_en > now() - ($2 || ' minutes')::interval
`;

export function hayDemasiadosFallos(filas: readonly Record<string, unknown>[]): boolean {
  const n = Number(filas[0]?.n ?? 0);
  return Number.isFinite(n) && n >= MAXIMO_DE_FALLOS;
}

export type PoliticaDeLimite =
  | { accion: "comprobar" }
  | { accion: "bloquear"; suceso: string }
  | { accion: "permitir"; suceso: string; nivel: "info" | "error" };

/**
 * Qué hacer cuando no se puede contar los fallos, que es la parte que antes se resolvía
 * sola y en silencio.
 *
 * Sin `AUTH_EVENT_IP_PEPPER` no hay huella, sin huella no hay nada que contar, y la
 * versión anterior devolvía «adelante»: una variable sin poner dejaba el acceso de
 * clientes sin ninguna protección contra fuerza bruta **sin que nadie se enterara**.
 *
 * La regla es la misma que el proyecto ya aplica en otros dos sitios. `ADMIN_SESSION_SECRET`
 * impide arrancar el panel si falta, «a propósito: con un valor por defecto las huellas
 * serían predecibles y todo parecería funcionar igual». Y `app/data/origenPublico.ts` sirve
 * el respaldo y **registra un error** en producción antes que usar la conexión privilegiada.
 * Aquí, el lado seguro de no poder limitar es **no dejar entrar**, no dejar entrar a todos:
 *
 * - **En producción, sin pimienta:** se bloquea. Un despliegue mal configurado deja el
 *   acceso de clientes cerrado, que es molesto y evidente, en lugar de abierto y silencioso.
 * - **En desarrollo, sin pimienta:** se permite con aviso, para no dejar inservible una
 *   máquina de trabajo por una variable que allí no protege de nada.
 * - **Sin IP**, aun con pimienta, no hay nada por lo que contar. No se bloquea —faltar la
 *   cabecera dejaría fuera a quien entra de buena fe—, pero en producción queda registrado
 *   como error: es lo que separa «no protege» de «no protege y nadie lo sabe».
 */
export function politicaDeLimite(entrada: {
  hayPimienta: boolean;
  hayIp: boolean;
  produccion: boolean;
}): PoliticaDeLimite {
  if (!entrada.hayPimienta) {
    return entrada.produccion
      ? { accion: "bloquear", suceso: "identidad-limite-sin-pimienta" }
      : { accion: "permitir", suceso: "identidad-limite-sin-pimienta", nivel: "info" };
  }

  if (!entrada.hayIp) {
    return {
      accion: "permitir",
      suceso: "identidad-limite-sin-ip",
      nivel: entrada.produccion ? "error" : "info",
    };
  }

  return { accion: "comprobar" };
}
