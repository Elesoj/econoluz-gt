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
