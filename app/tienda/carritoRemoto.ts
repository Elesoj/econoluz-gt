import type { LineaCarrito } from "./carrito";
import type {
  ResultadoDeFusionLocal,
  ResultadoRemoto,
  Sincronizador,
} from "./carritoSincronizacion";
import type { Descarte } from "./carritoServidor";

/**
 * El transporte hacia `/api/v1/carrito`.
 *
 * Solo traduce entre la API y el store: ni decide, ni reintenta, ni interpreta errores más
 * allá de «salió bien» o «no salió». Toda la política está en `carritoSincronizacion.ts`,
 * que por eso se puede probar sin red.
 *
 * **Nunca manda precios.** Referencias y cantidades, que es lo único que el servidor
 * acepta; el importe lo recalcula él contra el catálogo vigente.
 */

const BASE = "/api/v1/carrito";

type CuerpoDeRespuesta = {
  ok?: boolean;
  carrito?: { lineas?: { econoluzReference?: unknown; cantidad?: unknown }[] };
  descartes?: Descarte[];
};

/** Las líneas que vengan mal formadas se tiran: la respuesta es dato de fuera. */
function lineasDe(cuerpo: CuerpoDeRespuesta): LineaCarrito[] {
  const crudas = cuerpo.carrito?.lineas;
  if (!Array.isArray(crudas)) return [];

  return crudas.flatMap((linea) =>
    typeof linea?.econoluzReference === "string" &&
    typeof linea?.cantidad === "number" &&
    Number.isSafeInteger(linea.cantidad) &&
    linea.cantidad >= 1
      ? [{ econoluzReference: linea.econoluzReference, cantidad: linea.cantidad }]
      : [],
  );
}

async function pedir(ruta: string, opciones: RequestInit): Promise<ResultadoRemoto> {
  const respuesta = await fetch(BASE + ruta, {
    ...opciones,
    headers: { "content-type": "application/json", ...opciones.headers },
    // El carrito es privado: nunca se sirve de una caché intermedia.
    cache: "no-store",
    credentials: "same-origin",
  });

  // El 401 no es un fallo cualquiera: es que la sesión terminó. Quien llama tiene que
  // volver al carrito anónimo, no reintentar.
  if (respuesta.status === 401) return { ok: false, sinSesion: true };
  if (!respuesta.ok) return { ok: false };

  const cuerpo = (await respuesta.json()) as CuerpoDeRespuesta;
  return cuerpo.ok === true ? { ok: true, lineas: lineasDe(cuerpo) } : { ok: false };
}

export const sincronizadorRemoto: Sincronizador = {
  fijar: (econoluzReference, cantidad) =>
    pedir("/linea", { method: "PUT", body: JSON.stringify({ econoluzReference, cantidad }) }),
  quitar: (econoluzReference) =>
    pedir("/linea", { method: "DELETE", body: JSON.stringify({ econoluzReference }) }),
  vaciar: () => pedir("", { method: "DELETE" }),
};

/** Trae el carrito guardado del cliente. */
export async function leerCarritoRemoto(): Promise<ResultadoRemoto> {
  return pedir("", { method: "GET" });
}

export async function fusionarRemoto(
  lineas: { econoluzReference: string; cantidad: number }[],
  token: string,
): Promise<ResultadoDeFusionLocal> {
  const respuesta = await fetch(`${BASE}/fusionar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, lineas }),
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!respuesta.ok) return { ok: false };

  const cuerpo = (await respuesta.json()) as CuerpoDeRespuesta;
  if (cuerpo.ok !== true) return { ok: false };

  return {
    ok: true,
    lineas: lineasDe(cuerpo),
    descartes: Array.isArray(cuerpo.descartes) ? cuerpo.descartes : [],
  };
}
