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

import { fromProductRow, type ProductRow } from "../productRow";
import { aFilaProyeccion, type FilaProyeccion } from "../proyeccionPublica";
import { planificarProducto, type FilaDeCatalogo } from "./importacion";
import { proyeccionDesdeRelacional, type ProductoRelacional } from "./lectura";
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
