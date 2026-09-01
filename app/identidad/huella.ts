import { createHmac } from "node:crypto";

/**
 * Lo que se puede guardar de quien entra, sin guardar quién es.
 *
 * La IP **nunca** se almacena en claro. Se guarda un HMAC con una pimienta
 * secreta, truncado, que sirve para lo único que necesitamos —ver que veinte
 * intentos fallidos vienen del mismo sitio— y no se puede revertir.
 *
 * Si la pimienta rota, las huellas anteriores dejan de ser comparables con las
 * nuevas. Es un coste aceptado y queda dicho para que nadie lo descubra por
 * sorpresa.
 */

/** 128 bits: de sobra para no colisionar, y la mitad de dato que guardar. */
const CARACTERES_DE_HUELLA = 32;

export function huellaDeIp(ip: string | null, pimienta: string | undefined): string | null {
  // Sin pimienta no se calcula una huella débil: se prefiere no tener ninguna
  // a tener una reversible con una tabla de las cuatro mil millones de IPv4.
  if (!ip || !pimienta) {
    return null;
  }

  return createHmac("sha256", pimienta).update(ip).digest("hex").slice(0, CARACTERES_DE_HUELLA);
}

const NAVEGADORES: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

const SISTEMAS: readonly [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iOS/, "iOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/**
 * La cadena completa del navegador es en sí misma una huella identificativa
 * —modelo de teléfono incluido—, así que solo se guarda la familia.
 */
export function familiaDeNavegador(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }

  const navegador = NAVEGADORES.find(([patron]) => patron.test(userAgent))?.[1];
  const sistema = SISTEMAS.find(([patron]) => patron.test(userAgent))?.[1];

  if (!navegador && !sistema) return "Otro";
  if (!sistema) return navegador!;
  if (!navegador) return sistema;
  return `${navegador} en ${sistema}`;
}
