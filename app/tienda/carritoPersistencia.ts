import { CANTIDAD_MAXIMA_POR_LINEA, type LineaCarrito } from "./carrito";

/**
 * El carrito guardado en el navegador.
 *
 * Va en `localStorage` y no en `sessionStorage` —donde vive la selección de
 * cotización— porque comprar rara vez se hace de una sentada: se mira hoy y se
 * decide mañana. Se guardan solo referencias y cantidades; los precios se
 * resuelven después contra el catálogo del servidor.
 *
 * Todo lo que se lee de aquí es dato ajeno: lo puede haber escrito una versión
 * vieja de la web, otra pestaña, o una persona trasteando con las herramientas
 * del navegador. Se valida línea a línea y lo que no cuadra se tira sin ruido.
 */

export const CARRITO_STORAGE_KEY = "econoluz_carrito";

export type AlmacenCarrito = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LecturaCarrito =
  | { estado: "ok"; lineas: LineaCarrito[] }
  | { estado: "fallo" };

export type EscrituraCarrito = "escrito" | "borrado" | "sin-cambios" | "fallo";

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

export const parsearCarritoGuardado = (
  serializado: string | null,
): LineaCarrito[] => {
  if (serializado === null) {
    return [];
  }

  let contenido: unknown;

  try {
    contenido = JSON.parse(serializado) as unknown;
  } catch {
    return [];
  }

  if (!esObjeto(contenido) || !Array.isArray(contenido.lineas)) {
    return [];
  }

  const porReferencia = new Map<string, number>();

  for (const guardada of contenido.lineas) {
    if (!esObjeto(guardada)) {
      continue;
    }

    const { econoluzReference, cantidad } = guardada;

    if (
      typeof econoluzReference !== "string" ||
      econoluzReference.length === 0 ||
      typeof cantidad !== "number" ||
      !Number.isSafeInteger(cantidad) ||
      cantidad < 1
    ) {
      continue;
    }

    const acumulada = (porReferencia.get(econoluzReference) ?? 0) + cantidad;
    porReferencia.set(
      econoluzReference,
      Math.min(acumulada, CANTIDAD_MAXIMA_POR_LINEA),
    );
  }

  return [...porReferencia].map(([econoluzReference, cantidad]) => ({
    econoluzReference,
    cantidad,
  }));
};

export const leerCarrito = (almacen: AlmacenCarrito): LecturaCarrito => {
  try {
    return {
      estado: "ok",
      lineas: parsearCarritoGuardado(almacen.getItem(CARRITO_STORAGE_KEY)),
    };
  } catch {
    // Modo privado, almacenamiento bloqueado por el usuario o cuota agotada.
    // No es un error del que haya que informar a nadie: el carrito funcionará
    // durante la visita y simplemente no se recordará.
    return { estado: "fallo" };
  }
};

export const guardarCarrito = (
  almacen: AlmacenCarrito,
  lineas: readonly LineaCarrito[],
): EscrituraCarrito => {
  const deseado =
    lineas.length === 0
      ? null
      : JSON.stringify({
          lineas: lineas.map((linea) => ({
            econoluzReference: linea.econoluzReference,
            cantidad: linea.cantidad,
          })),
        });

  try {
    if (almacen.getItem(CARRITO_STORAGE_KEY) === deseado) {
      return "sin-cambios";
    }

    if (deseado === null) {
      almacen.removeItem(CARRITO_STORAGE_KEY);
      return "borrado";
    }

    almacen.setItem(CARRITO_STORAGE_KEY, deseado);
    return "escrito";
  } catch {
    return "fallo";
  }
};
