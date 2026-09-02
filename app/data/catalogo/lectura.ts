import type { Ejecutor } from "../../lib/datos/consulta";
import { aQuetzales } from "../../lib/dinero";
import { fromProductRow, type ProductRow } from "../productRow";
import { aFilaProyeccion, type FilaProyeccion } from "../proyeccionPublica";
import type { TipoDeAtributo } from "./atributos";
import type {
  DatosPrivadosDeProducto,
  ImagenDeProducto,
  NucleoDeProducto,
} from "./escritura";
import { precioVigente, type Precio, type TipoDePrecio } from "./precios";

export type CategoriaRelacional = {
  id: string;
  parentId: string | null;
  slug: string;
  nombre: string;
  principal: boolean;
};

export type ImagenRelacional = ImagenDeProducto & { id: string };

export type AtributoRelacional = {
  id: string;
  atributoId: string;
  clave: string;
  nombre: string;
  tipo: TipoDeAtributo;
  unidad: string | null;
  filterable: boolean;
  comparable: boolean;
  active: boolean;
  valueNumber: number | null;
  valueText: string | null;
  valueBool: boolean | null;
  optionId: string | null;
  optionClave: string | null;
  optionEtiqueta: string | null;
};

export type ProductoRelacional = {
  id: string;
  nucleo: Omit<NucleoDeProducto, "id">;
  privados: DatosPrivadosDeProducto | null;
  categorias: CategoriaRelacional[];
  imagenes: ImagenRelacional[];
  atributos: AtributoRelacional[];
  precios: Precio[];
};

const COLUMNAS_NUCLEO = [
  "id",
  "econoluz_reference",
  "position",
  "public_name",
  "public_description",
  "image",
  "images",
  "technical_specs",
  "product_type",
  "product_type_label",
  "application",
  "application_label",
  "finish",
  "finish_label",
  "family_label",
  "published",
] as const;

type FilaNucleo = NucleoDeProducto;

function nucleoDesdeFila(fila: FilaNucleo): Omit<NucleoDeProducto, "id"> {
  const nucleo = { ...fila };
  delete (nucleo as Partial<FilaNucleo>).id;
  return nucleo;
}

const fechaONull = (valor: unknown): Date | null => {
  if (valor === null || valor === undefined) return null;
  return valor instanceof Date ? valor : new Date(String(valor));
};

function armarProductoRelacional(
  fila: FilaNucleo,
  privadosRaw: Record<string, unknown> | undefined,
  categoriasRaw: Record<string, unknown>[],
  imagenesRaw: Record<string, unknown>[],
  atributosRaw: Record<string, unknown>[],
  preciosRaw: Record<string, unknown>[],
): ProductoRelacional {
  const productoId = String(fila.id);
  const privados = privadosRaw
    ? {
        supplier_brand: String(privadosRaw.supplier_brand ?? ""),
        supplier_brand_label: String(privadosRaw.supplier_brand_label ?? ""),
        supplier_series: String(privadosRaw.supplier_series ?? ""),
        supplier_series_label: String(privadosRaw.supplier_series_label ?? ""),
        supplier_code: String(privadosRaw.supplier_code ?? ""),
        supplier_name: String(privadosRaw.supplier_name ?? ""),
        supplier_description: String(privadosRaw.supplier_description ?? ""),
      }
    : null;

  return {
    id: productoId,
    nucleo: nucleoDesdeFila(fila),
    privados,
    categorias: categoriasRaw.map((categoria) => ({
      id: String(categoria.category_id),
      parentId: categoria.parent_id === null ? null : String(categoria.parent_id),
      slug: String(categoria.slug),
      nombre: String(categoria.nombre),
      principal: Boolean(categoria.principal),
    })),
    imagenes: imagenesRaw.map((imagen) => ({
      id: String(imagen.id),
      url: String(imagen.url),
      alt: String(imagen.alt),
      posicion: Number(imagen.posicion),
      visible: Boolean(imagen.visible),
      principal: Boolean(imagen.principal),
    })),
    atributos: atributosRaw.map((atributo) => ({
      id: String(atributo.id),
      atributoId: String(atributo.attribute_id),
      clave: String(atributo.clave),
      nombre: String(atributo.nombre),
      tipo: atributo.tipo as TipoDeAtributo,
      unidad: atributo.unidad === null ? null : String(atributo.unidad),
      filterable: Boolean(atributo.filterable),
      comparable: Boolean(atributo.comparable),
      active: Boolean(atributo.active),
      valueNumber: atributo.value_number === null ? null : Number(atributo.value_number),
      valueText: atributo.value_text === null ? null : String(atributo.value_text),
      valueBool: atributo.value_bool === null ? null : Boolean(atributo.value_bool),
      optionId: atributo.option_id === null ? null : String(atributo.option_id),
      optionClave: atributo.option_clave === null ? null : String(atributo.option_clave),
      optionEtiqueta:
        atributo.option_etiqueta === null ? null : String(atributo.option_etiqueta),
    })),
    precios: preciosRaw.map((precio) => ({
      id: String(precio.id),
      centavos: Number(precio.centavos),
      tipo: precio.tipo as TipoDePrecio,
      desde: fechaONull(precio.desde),
      hasta: fechaONull(precio.hasta),
    })),
  };
}

function agruparPorProducto<T extends Record<string, unknown>>(filas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const fila of filas) {
    const id = String(fila.product_id);
    const lista = mapa.get(id);
    if (lista) {
      lista.push(fila);
    } else {
      mapa.set(id, [fila]);
    }
  }
  return mapa;
}

export async function leerProductoRelacional(
  ejecutar: Ejecutor,
  id: string,
): Promise<ProductoRelacional | null> {
  const filas = (await ejecutar(
    `select ${COLUMNAS_NUCLEO.join(", ")}
       from products
      where id = $1`,
    [id],
  )) as FilaNucleo[];
  if (!filas[0]) return null;

  const [privados, categorias, imagenes, atributos, precios] = await Promise.all([
    ejecutar(
      `select supplier_brand, supplier_brand_label, supplier_series, supplier_series_label,
              supplier_code, supplier_name, supplier_description
         from product_private_data
        where product_id = $1`,
      [id],
    ),
    ejecutar(
      `select c.id::text as category_id, c.parent_id::text, c.slug, c.nombre, pc.principal
         from product_categories pc
         join categories c on c.id = pc.category_id
        where pc.product_id = $1
        order by pc.principal desc, c.posicion, c.id`,
      [id],
    ),
    ejecutar(
      `select id::text, url, alt, posicion, visible, principal
         from product_images
        where product_id = $1
        order by posicion, id`,
      [id],
    ),
    ejecutar(
      `select pav.id::text, pav.attribute_id::text, a.clave, a.nombre, a.tipo, a.unidad,
              a.filterable, a.comparable, a.active, pav.value_number, pav.value_text,
              pav.value_bool, pav.option_id::text, ao.clave as option_clave,
              ao.etiqueta as option_etiqueta
         from product_attribute_values pav
         join attributes a on a.id = pav.attribute_id
         left join attribute_options ao on ao.id = pav.option_id
        where pav.product_id = $1
        order by a.clave, ao.posicion, pav.id`,
      [id],
    ),
    ejecutar(
      `select id::text, centavos::text, tipo, lower(vigencia) as desde,
              upper(vigencia) as hasta
         from product_prices
        where product_id = $1
        order by lower(vigencia), id`,
      [id],
    ),
  ]);

  return armarProductoRelacional(
    filas[0],
    privados[0] as Record<string, unknown> | undefined,
    categorias as Record<string, unknown>[],
    imagenes as Record<string, unknown>[],
    atributos as Record<string, unknown>[],
    precios as Record<string, unknown>[],
  );
}

export async function leerCatalogoRelacional(
  ejecutar: Ejecutor,
): Promise<ProductoRelacional[]> {
  const [
    filasNucleo,
    filasPrivadas,
    filasCategorias,
    filasImagenes,
    filasAtributos,
    filasPrecios,
  ] = await Promise.all([
    ejecutar(
      `select ${COLUMNAS_NUCLEO.join(", ")}
         from products
        order by position, id`,
    ),
    ejecutar(
      `select product_id, supplier_brand, supplier_brand_label, supplier_series,
              supplier_series_label, supplier_code, supplier_name, supplier_description
         from product_private_data`,
    ),
    ejecutar(
      `select pc.product_id, c.id::text as category_id, c.parent_id::text, c.slug, c.nombre, pc.principal
         from product_categories pc
         join categories c on c.id = pc.category_id
        order by pc.principal desc, c.posicion, c.id`,
    ),
    ejecutar(
      `select product_id, id::text, url, alt, posicion, visible, principal
         from product_images
        order by posicion, id`,
    ),
    ejecutar(
      `select pav.product_id, pav.id::text, pav.attribute_id::text, a.clave, a.nombre, a.tipo, a.unidad,
              a.filterable, a.comparable, a.active, pav.value_number, pav.value_text,
              pav.value_bool, pav.option_id::text, ao.clave as option_clave,
              ao.etiqueta as option_etiqueta
         from product_attribute_values pav
         join attributes a on a.id = pav.attribute_id
         left join attribute_options ao on ao.id = pav.option_id
        order by a.clave, ao.posicion, pav.id`,
    ),
    ejecutar(
      `select product_id, id::text, centavos::text, tipo, lower(vigencia) as desde,
              upper(vigencia) as hasta
         from product_prices
        order by lower(vigencia), id`,
    ),
  ]);

  const privadosPorProducto = new Map<string, Record<string, unknown>>();
  for (const fila of filasPrivadas as Record<string, unknown>[]) {
    privadosPorProducto.set(String(fila.product_id), fila);
  }

  const categoriasPorProducto = agruparPorProducto(filasCategorias as Record<string, unknown>[]);
  const imagenesPorProducto = agruparPorProducto(filasImagenes as Record<string, unknown>[]);
  const atributosPorProducto = agruparPorProducto(filasAtributos as Record<string, unknown>[]);
  const preciosPorProducto = agruparPorProducto(filasPrecios as Record<string, unknown>[]);

  return (filasNucleo as FilaNucleo[]).map((fila) => {
    const productoId = String(fila.id);
    return armarProductoRelacional(
      fila,
      privadosPorProducto.get(productoId),
      categoriasPorProducto.get(productoId) ?? [],
      imagenesPorProducto.get(productoId) ?? [],
      atributosPorProducto.get(productoId) ?? [],
      preciosPorProducto.get(productoId) ?? [],
    );
  });
}

const PRIVADOS_VACIOS: DatosPrivadosDeProducto = {
  supplier_brand: "",
  supplier_brand_label: "",
  supplier_series: "",
  supplier_series_label: "",
  supplier_code: "",
  supplier_name: "",
  supplier_description: "",
};

function productoParaProyeccion(producto: ProductoRelacional): ProductRow {
  const visibles = producto.imagenes
    .filter((imagen) => imagen.visible)
    .sort((a, b) => a.posicion - b.posicion);
  const principal = visibles.find((imagen) => imagen.principal);
  const adicionales = visibles.filter((imagen) => !imagen.principal).map((imagen) => imagen.url);

  return {
    id: producto.id,
    ...producto.nucleo,
    image: principal?.url ?? producto.nucleo.image,
    images: adicionales.length > 0 ? adicionales : null,
    ...(producto.privados ?? PRIVADOS_VACIOS),
    price_gtq: null,
    stock: null,
    sellable_online: false,
  };
}

/** Reconstruye la misma proyección pública saneada a partir de la fuente relacional. */
export function proyeccionDesdeRelacional(
  producto: ProductoRelacional,
  ahora: Date,
): FilaProyeccion {
  const vigente = precioVigente(producto.precios, ahora);
  return aFilaProyeccion(
    fromProductRow(productoParaProyeccion(producto)),
    vigente ? aQuetzales(vigente.centavos) : null,
    producto.nucleo.position,
  );
}

export type ResultadoDeBusquedaPrivada = { id: string; supplier_code: string };

/** Búsqueda exclusiva de administración; quien llama aporta siempre la conexión privilegiada. */
export async function buscarPorCodigoDeProveedor(
  ejecutar: Ejecutor,
  texto: string,
): Promise<ResultadoDeBusquedaPrivada[]> {
  const buscado = texto.trim();
  if (!buscado) return [];
  return (await ejecutar(
    `select product_id as id, supplier_code
       from product_private_data
      where supplier_code ilike '%' || $1 || '%'
      order by supplier_code, product_id`,
    [buscado],
  )) as ResultadoDeBusquedaPrivada[];
}
