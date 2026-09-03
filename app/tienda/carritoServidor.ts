import { CANTIDAD_MAXIMA_POR_LINEA } from "./carrito";

/**
 * La lógica del carrito del cliente con sesión, en funciones puras.
 *
 * No sabe de React, ni de Neon, ni de peticiones: recibe datos y devuelve datos. Eso es
 * lo que permite probar la fusión —que es la parte delicada— sin levantar nada, y lo que
 * la deja lista para que el subproyecto 10 la reutilice desde la API móvil.
 *
 * **El carrito nunca guarda precios.** Guarda qué y cuánto; el importe se recalcula
 * contra el catálogo del servidor cada vez que se pinta o se cobra. Si el precio viajara
 * con la línea, acabaría siendo un precio que el navegador puede fijar.
 */

/** Por qué una línea no pudo entrar. Se le dice al cliente; no se borra en silencio. */
export type MotivoDeDescarte = "inexistente" | "despublicado" | "sin-precio";

/** Lo que el servidor sabe de un producto para decidir si se puede comprar. */
export type ProductoDelCatalogo = {
  productId: string;
  econoluzReference: string;
  publicado: boolean;
  /** `null` es «no está a la venta». Tener precio es estar a la venta (`CLAUDE.md` §2). */
  precioCentavos: number | null;
};

/** Una línea del carrito guardado: producto y cantidad, nada más. */
export type LineaDeCarrito = {
  productId: string;
  econoluzReference: string;
  cantidad: number;
};

/** Lo que manda el navegador: referencia pública y cantidad. */
export type LineaEnviada = {
  econoluzReference: string;
  cantidad: number;
};

export type Descarte = {
  econoluzReference: string;
  motivo: MotivoDeDescarte;
};

export type ResultadoDeFusion = {
  lineas: LineaDeCarrito[];
  descartes: Descarte[];
};

const esCantidadUtil = (cantidad: unknown): cantidad is number =>
  typeof cantidad === "number" && Number.isSafeInteger(cantidad) && cantidad >= 1;

/** El motivo por el que un producto no se puede comprar, o `null` si sí se puede. */
function motivoDeDescarte(producto: ProductoDelCatalogo | undefined): MotivoDeDescarte | null {
  if (!producto) return "inexistente";
  if (!producto.publicado) return "despublicado";
  if (producto.precioCentavos === null) return "sin-precio";
  return null;
}

/**
 * Suma el carrito local sobre el guardado.
 *
 * El orden del resultado es **primero lo guardado, en su orden, y después lo nuevo**: es
 * el que menos sorprende a quien inicia sesión y ve aparecer su carrito de siempre con
 * lo de hoy al final.
 *
 * El descarte alcanza también a lo ya guardado. Un producto que dejó de venderse mientras
 * el carrito dormía no puede quedarse dentro esperando un checkout que no podría cobrarlo;
 * sale, y se dice por qué.
 */
export function fusionarLineas(
  guardadas: readonly LineaDeCarrito[],
  enviadas: readonly LineaEnviada[],
  catalogo: ReadonlyMap<string, ProductoDelCatalogo>,
): ResultadoDeFusion {
  const sumadas = new Map<string, number>();
  const orden: string[] = [];

  const acumular = (referencia: string, cantidad: number) => {
    if (typeof referencia !== "string" || referencia.length === 0) return;
    if (!esCantidadUtil(cantidad)) return;
    if (!sumadas.has(referencia)) orden.push(referencia);
    sumadas.set(referencia, (sumadas.get(referencia) ?? 0) + cantidad);
  };

  for (const linea of guardadas) acumular(linea.econoluzReference, linea.cantidad);
  for (const linea of enviadas) acumular(linea.econoluzReference, linea.cantidad);

  const lineas: LineaDeCarrito[] = [];
  const descartes: Descarte[] = [];

  for (const referencia of orden) {
    const producto = catalogo.get(referencia);
    const motivo = motivoDeDescarte(producto);

    if (motivo || !producto) {
      descartes.push({ econoluzReference: referencia, motivo: motivo ?? "inexistente" });
      continue;
    }

    lineas.push({
      productId: producto.productId,
      econoluzReference: referencia,
      // Se recorta al tope en vez de rechazar la línea entera: quien pide mil piezas
      // quiere el producto, y quedarse sin ninguna sería la peor lectura de su intención.
      cantidad: Math.min(sumadas.get(referencia) ?? 0, CANTIDAD_MAXIMA_POR_LINEA),
    });
  }

  return { lineas, descartes };
}

export type DecisionDeFusion = { accion: "fusionar" } | { accion: "ya-aplicada" };

/**
 * Si esta fusión hay que aplicarla o ya se aplicó.
 *
 * El token lo genera el navegador y lo repite mientras la fusión no le conste
 * confirmada. Sin esta comprobación, una respuesta perdida por la red haría que el
 * reintento sumara las cantidades por segunda vez y el cliente encontrara el doble de
 * todo sin haber tocado nada.
 */
export function decidirFusion(
  carrito: { fusionToken: string | null } | null,
  token: string,
): DecisionDeFusion {
  if (carrito && carrito.fusionToken !== null && carrito.fusionToken === token) {
    return { accion: "ya-aplicada" };
  }
  return { accion: "fusionar" };
}
