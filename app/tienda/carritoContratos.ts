import { CANTIDAD_MAXIMA_POR_LINEA } from "./carrito";
import type { Descarte, LineaEnviada } from "./carritoServidor";

/**
 * El contrato de la API del carrito: qué entra, qué sale y cómo se dice que algo va mal.
 *
 * Vive aparte de las rutas a propósito. El subproyecto 10 tiene que poder reutilizar
 * estos tipos y estos validadores desde la API móvil sin arrastrar Next, y una validación
 * duplicada en dos sitios es una validación que algún día solo se arregla en uno.
 *
 * **Nada de lo que entra por aquí lleva precios.** Aunque el navegador los mande, se
 * quedan fuera: el importe se recalcula siempre contra el catálogo del servidor.
 */

/** Un cuerpo del carrito es diminuto. Todo lo que no lo sea es sospechoso. */
export const BYTES_MAXIMOS_DEL_CUERPO = 16 * 1024;

/** Suficiente para un carrito de verdad, y lejos de lo que sirve para hacer daño. */
export const LINEAS_MAXIMAS_POR_PETICION = 200;

/** `ECO-` más tres letras de familia y cuatro dígitos, como todo el catálogo. */
const FORMA_DE_REFERENCIA = /^ECO-[A-Z]{3}-\d{4}$/;

/** Un identificador de fusión: lo genera el navegador y solo tiene que ser opaco y corto. */
const FORMA_DE_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Los códigos de error de la API. **Cerrados y sin texto libre**: un mensaje de error es
 * la vía más común por la que acaban fuera el nombre de una tabla, una cadena de conexión
 * o el código del proveedor.
 */
export type ErrorDeCarrito =
  | "cuerpo-invalido"
  | "cuerpo-demasiado-grande"
  | "referencia-invalida"
  | "cantidad-invalida"
  | "token-invalido"
  | "demasiadas-lineas"
  | "sin-sesion"
  | "origen-no-valido"
  | "metodo-no-permitido"
  | "carrito-no-disponible";

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeCarrito };

const falla = (error: ErrorDeCarrito): { ok: false; error: ErrorDeCarrito } => ({
  ok: false,
  error,
});

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

export function validarReferencia(valor: unknown): Validacion<string> {
  // Sin `trim` ni mayúsculas automáticas: normalizar aquí es aceptar entradas que el
  // catálogo no produce y esconder de dónde salen.
  return typeof valor === "string" && FORMA_DE_REFERENCIA.test(valor)
    ? { ok: true, valor }
    : falla("referencia-invalida");
}

function validarCantidad(valor: unknown): Validacion<number> {
  return typeof valor === "number" &&
    Number.isSafeInteger(valor) &&
    valor >= 1 &&
    valor <= CANTIDAD_MAXIMA_POR_LINEA
    ? { ok: true, valor }
    : falla("cantidad-invalida");
}

/** El cuerpo de «fija esta cantidad» y de «quita esta línea». */
export function validarCuerpoDeLinea(cuerpo: unknown): Validacion<LineaEnviada> {
  if (!esObjeto(cuerpo)) return falla("cuerpo-invalido");

  const referencia = validarReferencia(cuerpo.econoluzReference);
  if (!referencia.ok) return referencia;

  const cantidad = validarCantidad(cuerpo.cantidad);
  if (!cantidad.ok) return cantidad;

  // Se construye un objeto nuevo con los dos campos, en vez de reenviar el recibido: así
  // un precio, un total o cualquier otro campo colado no puede seguir viaje.
  return { ok: true, valor: { econoluzReference: referencia.valor, cantidad: cantidad.valor } };
}

/** El cuerpo de «quita esta línea», que solo necesita la referencia. */
export function validarCuerpoDeReferencia(cuerpo: unknown): Validacion<{
  econoluzReference: string;
}> {
  if (!esObjeto(cuerpo)) return falla("cuerpo-invalido");

  const referencia = validarReferencia(cuerpo.econoluzReference);
  if (!referencia.ok) return referencia;

  return { ok: true, valor: { econoluzReference: referencia.valor } };
}

export type CuerpoDeFusion = {
  token: string;
  lineas: LineaEnviada[];
};

/**
 * El cuerpo de la fusión.
 *
 * Una línea con basura **no tira la fusión entera**: se descarta y las buenas entran. Al
 * cliente le duele mucho más perder el carrito que perder una línea rara, y el carrito
 * local es dato ajeno —lo puede haber escrito una versión vieja de la web o alguien
 * trasteando con las herramientas del navegador—.
 *
 * El token sí es obligatorio: sin él no hay forma de saber que un reintento es el mismo
 * intento, y la fusión sumaría dos veces.
 */
export function validarCuerpoDeFusion(cuerpo: unknown): Validacion<CuerpoDeFusion> {
  if (!esObjeto(cuerpo)) return falla("cuerpo-invalido");

  if (typeof cuerpo.token !== "string" || !FORMA_DE_TOKEN.test(cuerpo.token)) {
    return falla("token-invalido");
  }

  if (!Array.isArray(cuerpo.lineas)) return falla("cuerpo-invalido");
  if (cuerpo.lineas.length > LINEAS_MAXIMAS_POR_PETICION) return falla("demasiadas-lineas");

  const lineas: LineaEnviada[] = [];
  for (const linea of cuerpo.lineas) {
    const validada = validarCuerpoDeLinea(linea);
    if (validada.ok) lineas.push(validada.valor);
  }

  return { ok: true, valor: { token: cuerpo.token, lineas } };
}

/** Lo que la API devuelve. Referencias y cantidades; ni un precio, ni un dato interno. */
export type CarritoPublico = {
  lineas: { econoluzReference: string; cantidad: number }[];
};

export type RespuestaDeCarrito =
  | { ok: true; carrito: CarritoPublico; descartes?: Descarte[] }
  | { ok: false; error: ErrorDeCarrito };

/** El código HTTP que le toca a cada error. */
export function estadoDelError(error: ErrorDeCarrito): number {
  switch (error) {
    case "sin-sesion":
      return 401;
    case "origen-no-valido":
      return 403;
    case "metodo-no-permitido":
      return 405;
    case "cuerpo-demasiado-grande":
      return 413;
    case "carrito-no-disponible":
      return 503;
    default:
      return 400;
  }
}
