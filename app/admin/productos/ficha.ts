import { applications, productTypes } from "../../data/catalogTaxonomy";
import type { AdminAuthQuery } from "../auth/types";

/**
 * Los campos de ficha técnica que se ofrecen en el formulario, con el nombre
 * en español. La clave es la que ya usan los 313 productos: cambiarla dejaría
 * los datos existentes huérfanos.
 *
 * `specialFeatures` no está aquí porque es una lista y se edita aparte.
 */
export const CAMPOS_FICHA_TECNICA = [
  { clave: "applicationType", etiqueta: "Tipo de aplicación", ayuda: "Para qué sirve, en una línea" },
  { clave: "power", etiqueta: "Potencia", ayuda: "7 W / 15 W / 35 W" },
  { clave: "voltage", etiqueta: "Voltaje", ayuda: "120-277 V" },
  { clave: "luminousFlux", etiqueta: "Flujo luminoso", ayuda: "300 lm" },
  { clave: "efficiency", etiqueta: "Eficiencia", ayuda: "40 lm/W" },
  { clave: "colorTemperature", etiqueta: "Temperatura de color", ayuda: "3 000 K" },
  { clave: "cri", etiqueta: "IRC", ayuda: "90" },
  { clave: "beamAngle", etiqueta: "Ángulo de apertura", ayuda: "110°" },
  { clave: "protection", etiqueta: "Grado de protección", ayuda: "IP65" },
  { clave: "dimensions", etiqueta: "Dimensiones", ayuda: "0.30 m / 0.60 m" },
  { clave: "material", etiqueta: "Material", ayuda: "Aluminio inyectado" },
  { clave: "dimming", etiqueta: "Regulación", ayuda: "ON/OFF, 0-10 V…" },
  { clave: "lifespan", etiqueta: "Vida útil", ayuda: "50 000 h" },
  { clave: "warranty", etiqueta: "Garantía", ayuda: "3 años" },
] as const;

export type FichaTecnica = Record<string, string | string[]>;

export type EntradaFicha = {
  nombre: string;
  descripcion: string;
  imagen: string;
  tipo: string;
  aplicacion: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
};

export type DatosFicha = EntradaFicha & {
  tipoEtiqueta: string;
  aplicacionEtiqueta: string;
};

export type ResultadoValidacion =
  | { ok: true; datos: DatosFicha }
  | { ok: false; errores: string[] };

type TipoConocido = keyof typeof productTypes;

function esTipoConocido(valor: string): valor is TipoConocido {
  return Object.hasOwn(productTypes, valor);
}

/** Las aplicaciones que admite un tipo, en el orden de la taxonomía. */
export function aplicacionesDe(tipo: string) {
  if (!esTipoConocido(tipo)) {
    return [];
  }

  return productTypes[tipo].applications.map((id) => ({
    id,
    label: applications[id as keyof typeof applications]?.label ?? id,
  }));
}

/**
 * Valida lo que llega del formulario.
 *
 * Lo importante aquí no es rellenar huecos, es que **la aplicación pertenezca
 * al tipo**: el catálogo guiado filtra por esa pareja, así que un producto con
 * una aplicación que su tipo no admite queda invisible para quien lo busque.
 */
export function validarFichaProducto(entrada: EntradaFicha): ResultadoValidacion {
  const errores: string[] = [];

  const nombre = entrada.nombre.trim();
  if (nombre.length === 0) {
    errores.push("El nombre no puede quedar vacío.");
  }

  const imagen = entrada.imagen.trim();
  if (imagen.length === 0) {
    errores.push("El producto necesita una imagen.");
  }

  if (!esTipoConocido(entrada.tipo)) {
    errores.push("Ese tipo de producto no existe.");
    return { ok: false, errores };
  }

  const admitidas = aplicacionesDe(entrada.tipo);
  const aplicacion = admitidas.find((candidata) => candidata.id === entrada.aplicacion);
  if (!aplicacion) {
    errores.push(
      `La aplicación elegida no pertenece a ${productTypes[entrada.tipo].label}. ` +
        "Si no coincide, el producto no aparece en los filtros del catálogo.",
    );
  }

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  return {
    ok: true,
    datos: {
      ...entrada,
      nombre,
      imagen,
      descripcion: entrada.descripcion.trim(),
      acabado: entrada.acabado.trim(),
      acabadoEtiqueta: entrada.acabadoEtiqueta.trim(),
      familia: entrada.familia.trim(),
      tipoEtiqueta: productTypes[entrada.tipo].label,
      aplicacionEtiqueta: aplicacion?.label ?? "",
    },
  };
}

/**
 * Arma la ficha técnica desde el formulario. Un campo vacío **no se guarda**:
 * dejarlo como cadena vacía llenaría la ficha del catálogo de renglones sin
 * contenido.
 */
export function fichaTecnicaDesdeFormulario(
  campos: Record<string, string>,
  caracteristicas: string,
): FichaTecnica {
  const ficha: FichaTecnica = {};

  for (const [clave, valor] of Object.entries(campos)) {
    const limpio = valor.trim();
    if (limpio.length > 0) {
      ficha[clave] = limpio;
    }
  }

  const lista = caracteristicas
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);

  if (lista.length > 0) {
    ficha.specialFeatures = lista;
  }

  return ficha;
}

/** Devuelve una lista guardada al formulario, un elemento por renglón. */
export function lineasDesdeLista(valor: string | string[] | undefined) {
  if (Array.isArray(valor)) {
    return valor.join("\n");
  }
  return valor ?? "";
}

/**
 * Un producto tal y como se edita en el panel.
 *
 * Los datos del proveedor están aquí a propósito: el panel es interno y son
 * justo los que hay que poder consultar. Lo que no puede pasar es que crucen
 * al catálogo público, y de eso se encarga `publicProduct.ts`.
 */
export type ProductoFicha = {
  referencia: string;
  nombre: string;
  descripcion: string;
  imagen: string;
  galeria: string[];
  fichaTecnica: FichaTecnica;
  tipo: string;
  aplicacion: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
  proveedorMarca: string;
  proveedorSerie: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  proveedorDescripcion: string;
  precio: number | null;
  existencias: number | null;
  seVendeEnLinea: boolean;
  publicado: boolean;
};

function comoTexto(valor: unknown) {
  return valor === null || valor === undefined ? "" : String(valor);
}

function comoNumeroONulo(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export async function leerProductoPorReferencia(
  query: AdminAuthQuery,
  referencia: string,
): Promise<ProductoFicha | null> {
  const filas = await query(
    `
      select
        econoluz_reference, public_name, public_description, image, images,
        technical_specs, product_type, application, finish, finish_label,
        family_label, supplier_brand_label, supplier_series_label, supplier_code,
        supplier_name, supplier_description, price_gtq, stock, sellable_online,
        published
      from products
      where econoluz_reference = $1
      limit 1
    `,
    [referencia],
  );

  const fila = filas[0];
  if (!fila) {
    return null;
  }

  return {
    referencia: comoTexto(fila.econoluz_reference),
    nombre: comoTexto(fila.public_name),
    descripcion: comoTexto(fila.public_description),
    imagen: comoTexto(fila.image),
    galeria: Array.isArray(fila.images) ? fila.images.map(String) : [],
    fichaTecnica: (fila.technical_specs as FichaTecnica) ?? {},
    tipo: comoTexto(fila.product_type),
    aplicacion: comoTexto(fila.application),
    acabado: comoTexto(fila.finish),
    acabadoEtiqueta: comoTexto(fila.finish_label),
    familia: comoTexto(fila.family_label),
    proveedorMarca: comoTexto(fila.supplier_brand_label),
    proveedorSerie: comoTexto(fila.supplier_series_label),
    proveedorCodigo: comoTexto(fila.supplier_code),
    proveedorNombre: comoTexto(fila.supplier_name),
    proveedorDescripcion: comoTexto(fila.supplier_description),
    precio: comoNumeroONulo(fila.price_gtq),
    existencias: comoNumeroONulo(fila.stock),
    seVendeEnLinea: Boolean(fila.sellable_online),
    publicado: Boolean(fila.published),
  };
}

export type CambioFicha = {
  referencia: string;
  nombre: string;
  descripcion: string;
  imagen: string;
  galeria: string[];
  fichaTecnica: FichaTecnica;
  tipo: string;
  tipoEtiqueta: string;
  aplicacion: string;
  aplicacionEtiqueta: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  proveedorDescripcion: string;
  precio: number | null;
  existencias: number | null;
  seVendeEnLinea: boolean;
  publicado: boolean;
};

/**
 * Guarda la ficha completa.
 *
 * `supplier_brand` y `supplier_series` **no se tocan**: son parejas de
 * identificador y etiqueta que otros módulos internos dan por buenas, y
 * cambiarlas desde un campo de texto las desemparejaría. Se editan el código,
 * el nombre y la descripción del fabricante, que son texto suelto.
 *
 * Una galería vacía se guarda como `null`, no como lista vacía: en este
 * catálogo significan lo mismo para el visitante, pero `null` es lo que ya
 * tienen los 249 productos sin fotos adicionales.
 */
export async function guardarFichaProducto(
  query: AdminAuthQuery,
  cambio: CambioFicha,
): Promise<void> {
  await query(
    `
      update products
      set public_name = $1,
          public_description = $2,
          image = $3,
          images = $4::jsonb,
          technical_specs = $5::jsonb,
          product_type = $6,
          product_type_label = $7,
          application = $8,
          application_label = $9,
          finish = $10,
          finish_label = $11,
          family_label = $12,
          supplier_code = $13,
          supplier_name = $14,
          supplier_description = $15,
          price_gtq = $16,
          stock = $17,
          sellable_online = $18,
          published = $19
      where econoluz_reference = $20
    `,
    [
      cambio.nombre,
      cambio.descripcion,
      cambio.imagen,
      cambio.galeria.length > 0 ? JSON.stringify(cambio.galeria) : null,
      JSON.stringify(cambio.fichaTecnica),
      cambio.tipo,
      cambio.tipoEtiqueta,
      cambio.aplicacion,
      cambio.aplicacionEtiqueta,
      cambio.acabado,
      cambio.acabadoEtiqueta,
      cambio.familia,
      cambio.proveedorCodigo,
      cambio.proveedorNombre,
      cambio.proveedorDescripcion,
      cambio.precio,
      cambio.existencias,
      cambio.seVendeEnLinea,
      cambio.publicado,
      cambio.referencia,
    ],
  );
}
