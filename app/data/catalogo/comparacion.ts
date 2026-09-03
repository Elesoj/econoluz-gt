/**
 * La representación canónica con la que se comparan el catálogo antiguo y el relacional.
 *
 * Módulo puro: sin red, sin base de datos y sin `server-only`, para poder probarlo entero.
 *
 * **Aquí no entra ni un dato del proveedor.** El canónico se construye campo a campo, no
 * copiando objetos, precisamente para que añadir mañana una columna privada a `products`
 * no arrastre el dato hasta un registro. Lo que no se nombra aquí no puede salir.
 *
 * Cada lado se traduce con la transformación **acordada**: las categorías y los atributos
 * del lado antiguo salen de `planificarProducto`, que es el contrato de importación
 * aprobado el 02/09/2026. Las imágenes, en cambio, se derivan aquí del modo literal en que
 * hoy las sirve el catálogo —principal primero y galería después, **sin quitar
 * repetidas**—, para que la deduplicación que sí hace el importador aparezca como
 * diferencia real en vez de quedar escondida.
 */

import { createHash, randomBytes } from "node:crypto";

import type { Ejecutor } from "../../lib/datos/consulta";
import { fromProductRow, type ProductRow } from "../productRow";
import { aFilaProyeccion, type FilaProyeccion } from "../proyeccionPublica";
import { planificarProducto, type FilaDeCatalogo } from "./importacion";
import {
  leerCatalogoRelacional,
  proyeccionDesdeRelacional,
  type ProductoRelacional,
} from "./lectura";
import { preciosVigentes } from "./precios";

export type ImagenCanonica = {
  url: string;
  alt: string;
  posicion: number;
  visible: boolean;
  principal: boolean;
};

export type AtributoCanonico = {
  clave: string;
  nombre: string;
  unidad: string | null;
  numero: number | null;
  texto: string | null;
  booleano: boolean | null;
  opcion: string | null;
};

export type ProductoCanonico = {
  id: string;
  referencia: string;
  publicado: boolean;
  orden: number;
  categorias: string[];
  categoriaPrincipal: string | null;
  imagenes: ImagenCanonica[];
  atributos: AtributoCanonico[];
  precioNormalCentavos: number | null;
  precioPromocionCentavos: number | null;
  proyeccion: FilaProyeccion;
};

export type CatalogoCanonico = { orden: string[]; productos: ProductoCanonico[] };

/** El mismo hueco entre posiciones que usa el importador. */
const PASO_DE_POSICION = 10;

const porPosicionYUrl = (a: ImagenCanonica, b: ImagenCanonica) =>
  a.posicion - b.posicion || a.url.localeCompare(b.url);

const porClave = (a: AtributoCanonico, b: AtributoCanonico) => a.clave.localeCompare(b.clave);

/** El identificador público: el mismo que ya calcula `toPublicProduct`. */
const idPublico = (referencia: string) => referencia.toLowerCase();

export function canonicoDesdeLegacy(fila: FilaDeCatalogo): ProductoCanonico {
  const plan = planificarProducto(fila);

  const imagenes: ImagenCanonica[] = [fila.image, ...(fila.images ?? [])]
    .filter((url) => Boolean(url))
    .map((url, indice) => ({
      url,
      alt: fila.public_name,
      posicion: indice * PASO_DE_POSICION,
      visible: true,
      principal: indice === 0,
    }))
    .sort(porPosicionYUrl);

  const atributos: AtributoCanonico[] = plan.atributos
    .map((atributo) => ({
      clave: atributo.clave,
      nombre: atributo.nombre,
      unidad: atributo.unidad,
      numero: atributo.numero,
      texto: null,
      booleano: null,
      opcion: null,
    }))
    .sort(porClave);

  return {
    id: idPublico(fila.econoluz_reference),
    referencia: fila.econoluz_reference,
    publicado: fila.published,
    orden: fila.position,
    categorias: plan.categorias.map((categoria) => categoria.slug).sort(),
    categoriaPrincipal: plan.categorias.find((categoria) => categoria.principal)?.slug ?? null,
    imagenes,
    atributos,
    precioNormalCentavos: plan.precioNormalCentavos,
    // El catálogo antiguo no tiene promociones: solo la columna `price_gtq`.
    precioPromocionCentavos: null,
    proyeccion: aFilaProyeccion(
      fromProductRow(fila as unknown as ProductRow),
      fila.price_gtq,
      fila.position,
    ),
  };
}

export function canonicoDesdeRelacional(
  producto: ProductoRelacional,
  ahora: Date,
): ProductoCanonico {
  const { normal, promocion } = preciosVigentes(producto.precios, ahora);

  const imagenes: ImagenCanonica[] = producto.imagenes
    .map((imagen) => ({
      url: imagen.url,
      alt: imagen.alt,
      posicion: imagen.posicion,
      visible: imagen.visible,
      principal: imagen.principal,
    }))
    .sort(porPosicionYUrl);

  const atributos: AtributoCanonico[] = producto.atributos
    .map((atributo) => ({
      clave: atributo.clave,
      nombre: atributo.nombre,
      unidad: atributo.unidad,
      numero: atributo.valueNumber,
      texto: atributo.valueText,
      booleano: atributo.valueBool,
      opcion: atributo.optionClave,
    }))
    .sort(porClave);

  return {
    id: idPublico(producto.nucleo.econoluz_reference),
    referencia: producto.nucleo.econoluz_reference,
    publicado: producto.nucleo.published,
    orden: producto.nucleo.position,
    categorias: producto.categorias.map((categoria) => categoria.slug).sort(),
    categoriaPrincipal:
      producto.categorias.find((categoria) => categoria.principal)?.slug ?? null,
    imagenes,
    atributos,
    precioNormalCentavos: normal?.centavos ?? null,
    precioPromocionCentavos: promocion?.centavos ?? null,
    proyeccion: proyeccionDesdeRelacional(producto, ahora),
  };
}

function ordenar(productos: readonly ProductoCanonico[]): string[] {
  return productos
    .filter((producto) => producto.publicado)
    .slice()
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
    .map((producto) => producto.id);
}

export function catalogoCanonicoDesdeLegacy(
  filas: readonly FilaDeCatalogo[],
): CatalogoCanonico {
  const productos = filas.map(canonicoDesdeLegacy);
  return { orden: ordenar(productos), productos };
}

export function catalogoCanonicoDesdeRelacional(
  productos: readonly ProductoRelacional[],
  ahora: Date,
): CatalogoCanonico {
  const canonicos = productos.map((producto) => canonicoDesdeRelacional(producto, ahora));
  return { orden: ordenar(canonicos), productos: canonicos };
}

// --- El motor de diferencias -------------------------------------------------------

export type TipoDeDiferencia =
  | "producto_ausente"
  | "producto_adicional"
  | "campo_distinto"
  | "coleccion_distinta"
  | "orden_distinto";

export type Diferencia = {
  tipo: TipoDeDiferencia;
  producto: string | null;
  campo: string;
  huellaLegacy: string | null;
  huellaRelacional: string | null;
};

export type ResumenDeComparacion = {
  productosLegacy: number;
  productosRelacional: number;
  comparados: number;
  totalDiferencias: number;
  porTipo: Record<string, number>;
  porCampo: Record<string, number>;
  diferencias: Diferencia[];
  omitidas: number;
};

/**
 * Cuántas diferencias se guardan como detalle. El resto se cuenta pero no se lista: 313
 * productos por doce dimensiones pueden dar miles de líneas, y un registro que crece con
 * el tamaño del catálogo es un registro que nadie lee y que además cuesta dinero.
 */
export const LIMITE_DE_DIFERENCIAS = 25;

/** JSON con las claves ordenadas, para que dos objetos iguales den la misma huella. */
function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, contenido]) => [clave, canonizar(contenido)]),
    );
  }
  return valor;
}

/**
 * Huella irreversible y corta de un valor.
 *
 * Se registra la huella y **nunca el valor**. Aunque el canónico solo contiene datos
 * públicos, registrar huellas mantiene la regla simple —«de aquí no sale contenido»— y
 * evita que un campo se cuele el día que alguien amplíe el canónico.
 */
export function huella(valor: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonizar(valor) ?? null))
    .digest("hex")
    .slice(0, 16);
}

const iguales = (a: unknown, b: unknown) =>
  JSON.stringify(canonizar(a)) === JSON.stringify(canonizar(b));

const CAMPOS_ESCALARES = [
  "referencia",
  "publicado",
  "orden",
  "categoriaPrincipal",
  "precioNormalCentavos",
  "precioPromocionCentavos",
] as const;

const CAMPOS_COLECCION = ["categorias", "imagenes", "atributos"] as const;

function diferenciasDeProyeccion(
  producto: string,
  legacy: FilaProyeccion,
  relacional: FilaProyeccion,
): Diferencia[] {
  const claves = [...new Set([...Object.keys(legacy), ...Object.keys(relacional)])].sort();
  const salida: Diferencia[] = [];
  for (const clave of claves) {
    const a = (legacy as unknown as Record<string, unknown>)[clave];
    const b = (relacional as unknown as Record<string, unknown>)[clave];
    if (iguales(a, b)) continue;
    salida.push({
      tipo: "campo_distinto",
      producto,
      campo: `proyeccion.${clave}`,
      huellaLegacy: huella(a),
      huellaRelacional: huella(b),
    });
  }
  return salida;
}

function diferenciasDeProducto(
  legacy: ProductoCanonico,
  relacional: ProductoCanonico,
): Diferencia[] {
  const salida: Diferencia[] = [];

  for (const campo of CAMPOS_ESCALARES) {
    if (iguales(legacy[campo], relacional[campo])) continue;
    salida.push({
      tipo: "campo_distinto",
      producto: legacy.id,
      campo,
      huellaLegacy: huella(legacy[campo]),
      huellaRelacional: huella(relacional[campo]),
    });
  }

  for (const campo of CAMPOS_COLECCION) {
    if (iguales(legacy[campo], relacional[campo])) continue;
    salida.push({
      tipo: "coleccion_distinta",
      producto: legacy.id,
      campo,
      huellaLegacy: huella(legacy[campo]),
      huellaRelacional: huella(relacional[campo]),
    });
  }

  return [
    ...salida,
    ...diferenciasDeProyeccion(legacy.id, legacy.proyeccion, relacional.proyeccion),
  ];
}

export function compararCatalogos(
  legacy: CatalogoCanonico,
  relacional: CatalogoCanonico,
  limite: number = LIMITE_DE_DIFERENCIAS,
): ResumenDeComparacion {
  const porIdRelacional = new Map(relacional.productos.map((p) => [p.id, p]));
  const porIdLegacy = new Map(legacy.productos.map((p) => [p.id, p]));

  const diferencias: Diferencia[] = [];
  const porTipo: Record<string, number> = {};
  const porCampo: Record<string, number> = {};
  let total = 0;
  let comparados = 0;

  const anotar = (diferencia: Diferencia) => {
    total += 1;
    porTipo[diferencia.tipo] = (porTipo[diferencia.tipo] ?? 0) + 1;
    porCampo[diferencia.campo] = (porCampo[diferencia.campo] ?? 0) + 1;
    if (diferencias.length < limite) diferencias.push(diferencia);
  };

  for (const producto of legacy.productos) {
    const pareja = porIdRelacional.get(producto.id);
    if (!pareja) {
      anotar({
        tipo: "producto_ausente",
        producto: producto.id,
        campo: "producto",
        huellaLegacy: huella(producto.referencia),
        huellaRelacional: null,
      });
      continue;
    }
    comparados += 1;
    for (const diferencia of diferenciasDeProducto(producto, pareja)) anotar(diferencia);
  }

  for (const producto of relacional.productos) {
    if (porIdLegacy.has(producto.id)) continue;
    anotar({
      tipo: "producto_adicional",
      producto: producto.id,
      campo: "producto",
      huellaLegacy: null,
      huellaRelacional: huella(producto.referencia),
    });
  }

  // El orden del catálogo sí significa algo: es el que ve el visitante. Se compara como
  // una secuencia, no como un conjunto.
  if (!iguales(legacy.orden, relacional.orden)) {
    anotar({
      tipo: "orden_distinto",
      producto: null,
      campo: "orden",
      huellaLegacy: huella(legacy.orden),
      huellaRelacional: huella(relacional.orden),
    });
  }

  return {
    productosLegacy: legacy.productos.length,
    productosRelacional: relacional.productos.length,
    comparados,
    totalDiferencias: total,
    porTipo,
    porCampo,
    diferencias,
    omitidas: Math.max(0, total - diferencias.length),
  };
}

// --- La comparación contra la base ---------------------------------------------------

/**
 * La lectura del catálogo antiguo **para comparar**, que no es la que sirve al visitante.
 *
 * Son dos consultas distintas a propósito: la del visitante (`app/data/catalog.server.ts`)
 * no se toca ni un carácter, porque el compromiso de esta fase es que reciba exactamente
 * lo de siempre. Esta otra pide además `published` y `price_gtq` de **todos** los
 * productos, publicados o no, porque el estado de publicación es una de las dimensiones
 * que hay que comparar.
 */
export const CONSULTA_LEGACY_COMPLETA =
  "select id, econoluz_reference, position, public_name, public_description, image, " +
  "images, technical_specs, product_type, product_type_label, application, " +
  "application_label, finish, finish_label, family_label, supplier_brand, " +
  "supplier_brand_label, supplier_series, supplier_series_label, supplier_code, " +
  "supplier_name, supplier_description, price_gtq, published " +
  "from products order by position, id";

export type Registro = (
  nivel: "info" | "error",
  suceso: string,
  datos?: Record<string, string | number | boolean>,
) => void;

/**
 * Cuántas consultas globales emite hoy `leerCatalogoRelacional`. **Es una referencia, no
 * lo que se registra**: el número que va al log se cuenta de verdad, envolviendo el
 * ejecutor. Publicar esta constante como si fuera una medición dejaría el registro
 * diciendo «6» aunque volviera el N+1, que es justo lo que ese campo debe delatar.
 */
export const CONSULTAS_RELACIONALES_ESPERADAS = 6;

/** El lector del catálogo relacional. Se inyecta para poder medirlo en las pruebas. */
export type LectorRelacional = (ejecutar: Ejecutor) => Promise<ProductoRelacional[]>;

/** Las filas llegan de Postgres con `numeric` en texto y `jsonb` ya expandido. */
export function normalizarFilaLegacy(fila: Record<string, unknown>): FilaDeCatalogo {
  return {
    id: String(fila.id),
    econoluz_reference: String(fila.econoluz_reference),
    position: Number(fila.position),
    public_name: String(fila.public_name),
    public_description: String(fila.public_description),
    image: String(fila.image),
    images: Array.isArray(fila.images) ? fila.images.map(String) : null,
    technical_specs: (fila.technical_specs ?? null) as FilaDeCatalogo["technical_specs"],
    product_type: String(fila.product_type),
    product_type_label: String(fila.product_type_label),
    application: String(fila.application),
    application_label: String(fila.application_label),
    finish: String(fila.finish),
    finish_label: String(fila.finish_label),
    family_label: String(fila.family_label),
    supplier_brand: String(fila.supplier_brand ?? ""),
    supplier_brand_label: String(fila.supplier_brand_label ?? ""),
    supplier_series: String(fila.supplier_series ?? ""),
    supplier_series_label: String(fila.supplier_series_label ?? ""),
    supplier_code: String(fila.supplier_code ?? ""),
    supplier_name: String(fila.supplier_name ?? ""),
    supplier_description: String(fila.supplier_description ?? ""),
    price_gtq:
      fila.price_gtq === null || fila.price_gtq === undefined ? null : Number(fila.price_gtq),
    published: Boolean(fila.published),
  };
}

/**
 * Lee los dos catálogos, los compara y registra el resultado.
 *
 * **No lanza por un fallo de la base ni de la comparación:** devuelve `null` y quien llama
 * sigue sirviendo `legacy`. Sí puede propagar el fallo de `registro` —si el propio
 * registro está roto no hay dónde anotarlo—, y por eso `servirSegunModelo` vuelve a
 * protegerla: la garantía de que el visitante recibe `legacy` se sostiene allí, no aquí.
 *
 * Del error solo se registra su clase: el texto de Postgres puede llevar el host, el rol o
 * la contraseña, y esos no entran en un registro.
 */
export async function ejecutarComparacion(
  ejecutar: Ejecutor,
  registro: Registro,
  ahora: Date = new Date(),
  lector: LectorRelacional = leerCatalogoRelacional,
): Promise<ResumenDeComparacion | null> {
  const correlacion = randomBytes(6).toString("hex");
  const arranque = Date.now();

  // Se cuentan las consultas que emite el lector relacional, no las que se supone que
  // emite. Es la única forma de que el registro delate un N+1 en cuanto vuelva.
  let consultasRelacionales = 0;
  const ejecutarContando: Ejecutor = (texto, parametros) => {
    consultasRelacionales += 1;
    return ejecutar(texto, parametros);
  };

  try {
    const filas = (await ejecutar(CONSULTA_LEGACY_COMPLETA, [])) as Record<string, unknown>[];
    const legacy = catalogoCanonicoDesdeLegacy(filas.map(normalizarFilaLegacy));
    const relacional = catalogoCanonicoDesdeRelacional(
      await lector(ejecutarContando),
      ahora,
    );

    const resumen = compararCatalogos(legacy, relacional);

    for (const diferencia of resumen.diferencias) {
      registro("info", "catalogo-shadow-diferencia", {
        correlacion,
        tipo: diferencia.tipo,
        producto: diferencia.producto ?? "",
        campo: diferencia.campo,
        huellaLegacy: diferencia.huellaLegacy ?? "",
        huellaRelacional: diferencia.huellaRelacional ?? "",
      });
    }

    registro(resumen.totalDiferencias === 0 ? "info" : "error", "catalogo-shadow-resumen", {
      correlacion,
      productosLegacy: resumen.productosLegacy,
      productosRelacional: resumen.productosRelacional,
      comparados: resumen.comparados,
      diferencias: resumen.totalDiferencias,
      omitidas: resumen.omitidas,
      consultasRelacionales,
      duracionMs: Date.now() - arranque,
    });

    return resumen;
  } catch (error) {
    registro("error", "catalogo-shadow-error", {
      correlacion,
      causa: error instanceof Error ? error.constructor.name : "desconocida",
      duracionMs: Date.now() - arranque,
    });
    return null;
  }
}
