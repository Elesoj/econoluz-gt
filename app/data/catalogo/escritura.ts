import type { Ejecutor } from "../../lib/datos/consulta";
import { ErrorDeDatos } from "../../lib/datos/errores";
import { aQuetzales } from "../../lib/dinero";
import { fromProductRow, type ProductRow } from "../productRow";
import { aFilaProyeccion } from "../proyeccionPublica";
import { construirUpsertProyeccion } from "../proyeccionPublicaSql";
import {
  decidirRetirada,
  TIPOS_DE_ATRIBUTO,
  validarAsignaciones,
  validarValor,
  type Asignacion,
  type TipoDeAtributo,
} from "./atributos";
import { validarPertenencias, type Pertenencia } from "./categorias";
import { precioVigente, type Precio } from "./precios";

/**
 * Parte todavía compartida con `products` durante la transición. Los datos del proveedor
 * viajan por separado y nunca se usan para construir la proyección pública sin sanearlos.
 */
export type NucleoDeProducto = Pick<
  ProductRow,
  | "id"
  | "econoluz_reference"
  | "position"
  | "public_name"
  | "public_description"
  | "image"
  | "images"
  | "technical_specs"
  | "product_type"
  | "product_type_label"
  | "application"
  | "application_label"
  | "finish"
  | "finish_label"
  | "family_label"
  | "published"
>;

export type DatosPrivadosDeProducto = Pick<
  ProductRow,
  | "supplier_brand"
  | "supplier_brand_label"
  | "supplier_series"
  | "supplier_series_label"
  | "supplier_code"
  | "supplier_name"
  | "supplier_description"
>;

export type ImagenDeProducto = {
  url: string;
  alt: string;
  posicion: number;
  visible: boolean;
  principal: boolean;
};

export type AtributoDeProducto = {
  atributoId: string;
  tipo: TipoDeAtributo;
  asignacion: Asignacion;
};

export type EntradaDeProducto = {
  id: string;
  nucleo: Omit<NucleoDeProducto, "id">;
  privados: DatosPrivadosDeProducto;
  categorias: Pertenencia[];
  imagenes: ImagenDeProducto[];
  atributos: AtributoDeProducto[];
  precioNormalCentavos: number | null;
  actor: { tipo: "admin" | "sistema" | "cliente"; id: string | null };
};

type ImagenExistente = ImagenDeProducto & { id: string };
type ValorExistente = {
  id: string;
  attribute_id: string;
  attribute_type: TipoDeAtributo;
  value_number: string | number | null;
  value_text: string | null;
  value_bool: boolean | null;
  option_id: string | null;
};

const conflicto = (motivo: string) => new ErrorDeDatos("conflicto", new Error(motivo));

function validarEntrada(entrada: EntradaDeProducto): void {
  const categorias = validarPertenencias(entrada.categorias);
  if (!categorias.ok) throw conflicto(categorias.motivo);

  if (entrada.nucleo.published) {
    const principalesVisibles = entrada.imagenes.filter(
      (imagen) => imagen.principal && imagen.visible,
    ).length;
    if (principalesVisibles !== 1) {
      throw conflicto("Un producto publicado necesita exactamente una imagen principal visible.");
    }
  }

  const posiciones = entrada.imagenes.map((imagen) => imagen.posicion);
  if (new Set(posiciones).size !== posiciones.length) {
    throw conflicto("Hay dos imágenes en la misma posición.");
  }
  if (entrada.imagenes.filter((imagen) => imagen.principal).length > 1) {
    throw conflicto("Hay más de una imagen principal.");
  }

  const porAtributo = new Map<string, AtributoDeProducto[]>();
  for (const atributo of entrada.atributos) {
    const valor = porAtributo.get(atributo.atributoId) ?? [];
    valor.push(atributo);
    porAtributo.set(atributo.atributoId, valor);
  }

  for (const [atributoId, atributos] of porAtributo) {
    const tipo = atributos[0].tipo;
    if (atributos.some((atributo) => atributo.tipo !== tipo)) {
      throw conflicto(`El atributo ${atributoId} llegó con dos tipos distintos.`);
    }
    const resultado = validarAsignaciones(
      { id: atributoId, tipo },
      atributos.map((atributo) => atributo.asignacion),
      // La actividad se decide después de leer los valores existentes: aquí todavía no
      // sabemos si una opción desactivada es nueva o histórica.
      "valor_existente",
    );
    if (!resultado.ok) throw conflicto(resultado.motivo);
  }

  if (
    entrada.precioNormalCentavos !== null &&
    (!Number.isInteger(entrada.precioNormalCentavos) || entrada.precioNormalCentavos < 0)
  ) {
    throw conflicto("El precio normal debe expresarse en centavos enteros no negativos.");
  }
}

async function escribirNucleo(ejecutar: Ejecutor, entrada: EntradaDeProducto): Promise<void> {
  const n = entrada.nucleo;
  await ejecutar(
    `insert into products (
       id, econoluz_reference, position, public_name, public_description, image, images,
       technical_specs, product_type, product_type_label, application, application_label,
       finish, finish_label, family_label, published
     ) values (
       $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16
     )
     on conflict (id) do update set
       econoluz_reference = excluded.econoluz_reference,
       position = excluded.position,
       public_name = excluded.public_name,
       public_description = excluded.public_description,
       image = excluded.image,
       images = excluded.images,
       technical_specs = excluded.technical_specs,
       product_type = excluded.product_type,
       product_type_label = excluded.product_type_label,
       application = excluded.application,
       application_label = excluded.application_label,
       finish = excluded.finish,
       finish_label = excluded.finish_label,
       family_label = excluded.family_label,
       published = excluded.published
     where row(
       products.econoluz_reference, products.position, products.public_name,
       products.public_description, products.image, products.images, products.technical_specs,
       products.product_type, products.product_type_label, products.application,
       products.application_label, products.finish, products.finish_label,
       products.family_label, products.published
     ) is distinct from row(
       excluded.econoluz_reference, excluded.position, excluded.public_name,
       excluded.public_description, excluded.image, excluded.images, excluded.technical_specs,
       excluded.product_type, excluded.product_type_label, excluded.application,
       excluded.application_label, excluded.finish, excluded.finish_label,
       excluded.family_label, excluded.published
     )`,
    [
      entrada.id,
      n.econoluz_reference,
      n.position,
      n.public_name,
      n.public_description,
      n.image,
      n.images === null ? null : JSON.stringify(n.images),
      n.technical_specs === null ? null : JSON.stringify(n.technical_specs),
      n.product_type,
      n.product_type_label,
      n.application,
      n.application_label,
      n.finish,
      n.finish_label,
      n.family_label,
      n.published,
    ],
  );
}

async function escribirPrivados(ejecutar: Ejecutor, entrada: EntradaDeProducto): Promise<void> {
  const p = entrada.privados;
  await ejecutar(
    `insert into product_private_data (
       product_id, supplier_brand, supplier_brand_label, supplier_series,
       supplier_series_label, supplier_code, supplier_name, supplier_description
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (product_id) do update set
       supplier_brand = excluded.supplier_brand,
       supplier_brand_label = excluded.supplier_brand_label,
       supplier_series = excluded.supplier_series,
       supplier_series_label = excluded.supplier_series_label,
       supplier_code = excluded.supplier_code,
       supplier_name = excluded.supplier_name,
       supplier_description = excluded.supplier_description
     where row(
       product_private_data.supplier_brand, product_private_data.supplier_brand_label,
       product_private_data.supplier_series, product_private_data.supplier_series_label,
       product_private_data.supplier_code, product_private_data.supplier_name,
       product_private_data.supplier_description
     ) is distinct from row(
       excluded.supplier_brand, excluded.supplier_brand_label, excluded.supplier_series,
       excluded.supplier_series_label, excluded.supplier_code, excluded.supplier_name,
       excluded.supplier_description
     )`,
    [
      entrada.id,
      p.supplier_brand,
      p.supplier_brand_label,
      p.supplier_series,
      p.supplier_series_label,
      p.supplier_code,
      p.supplier_name,
      p.supplier_description,
    ],
  );
}

async function sincronizarCategorias(ejecutar: Ejecutor, entrada: EntradaDeProducto) {
  const existentes = (await ejecutar(
    `select category_id::text, principal
       from product_categories
      where product_id = $1`,
    [entrada.id],
  )) as { category_id: string; principal: boolean }[];
  const deseadas = new Map(entrada.categorias.map((categoria) => [categoria.categoriaId, categoria]));

  for (const actual of existentes) {
    const deseada = deseadas.get(String(actual.category_id));
    if (!deseada) {
      await ejecutar(
        "delete from product_categories where product_id = $1 and category_id = $2",
        [entrada.id, actual.category_id],
      );
    } else if (actual.principal !== deseada.principal) {
      await ejecutar(
        `update product_categories set principal = $3
          where product_id = $1 and category_id = $2`,
        [entrada.id, actual.category_id, deseada.principal],
      );
    }
  }

  const idsExistentes = new Set(existentes.map((actual) => String(actual.category_id)));
  for (const deseada of entrada.categorias) {
    if (!idsExistentes.has(deseada.categoriaId)) {
      await ejecutar(
        `insert into product_categories (product_id, category_id, principal)
         values ($1, $2, $3)`,
        [entrada.id, deseada.categoriaId, deseada.principal],
      );
    }
  }
}

const mismaImagen = (a: ImagenExistente, b: ImagenDeProducto) =>
  a.url === b.url &&
  a.alt === b.alt &&
  Number(a.posicion) === b.posicion &&
  a.visible === b.visible &&
  a.principal === b.principal;

async function sincronizarImagenes(ejecutar: Ejecutor, entrada: EntradaDeProducto) {
  const existentes = (await ejecutar(
    `select id::text, url, alt, posicion, visible, principal
       from product_images
      where product_id = $1
      order by posicion`,
    [entrada.id],
  )) as ImagenExistente[];
  const porPosicion = new Map(existentes.map((imagen) => [Number(imagen.posicion), imagen]));
  const posiciones = new Set(entrada.imagenes.map((imagen) => imagen.posicion));

  for (const existente of existentes) {
    if (!posiciones.has(Number(existente.posicion))) {
      await ejecutar("delete from product_images where id = $1", [existente.id]);
    }
  }

  for (const imagen of entrada.imagenes) {
    const existente = porPosicion.get(imagen.posicion);
    if (!existente) {
      await ejecutar(
        `insert into product_images (product_id, url, alt, posicion, visible, principal)
         values ($1, $2, $3, $4, $5, $6)`,
        [entrada.id, imagen.url, imagen.alt, imagen.posicion, imagen.visible, imagen.principal],
      );
    } else if (!mismaImagen(existente, imagen)) {
      await ejecutar(
        `update product_images
            set url = $2, alt = $3, posicion = $4, visible = $5, principal = $6
          where id = $1`,
        [existente.id, imagen.url, imagen.alt, imagen.posicion, imagen.visible, imagen.principal],
      );
    }
  }
}

function columnasDeAsignacion(tipo: TipoDeAtributo, asignacion: Asignacion) {
  if (asignacion.clase === "opcion") {
    return { value_number: null, value_text: null, value_bool: null, option_id: asignacion.opcion.id };
  }
  const resultado = validarValor(tipo, asignacion.valor);
  if (!resultado.ok) throw conflicto(resultado.motivo);
  return resultado.columnas;
}

const claveDeValor = (atributoId: string, optionId: string | null) =>
  `${atributoId}:${optionId ?? "escalar"}`;

function mismoValor(existente: ValorExistente, deseado: ReturnType<typeof columnasDeAsignacion>) {
  const numeroExistente =
    existente.value_number === null ? null : Number(existente.value_number);
  return (
    numeroExistente === deseado.value_number &&
    existente.value_text === deseado.value_text &&
    existente.value_bool === deseado.value_bool &&
    (existente.option_id === null ? null : String(existente.option_id)) === deseado.option_id
  );
}

async function leerValoresExistentes(
  ejecutar: Ejecutor,
  productoId: string,
): Promise<ValorExistente[]> {
  return (await ejecutar(
    `select id::text, attribute_id::text, attribute_type, value_number, value_text,
            value_bool, option_id::text
       from product_attribute_values
      where product_id = $1`,
    [productoId],
  )) as ValorExistente[];
}

function validarActividadDeOpciones(
  entrada: EntradaDeProducto,
  existentes: readonly ValorExistente[],
): void {
  const clavesExistentes = new Set(
    existentes.map((valor) =>
      claveDeValor(String(valor.attribute_id), valor.option_id === null ? null : String(valor.option_id)),
    ),
  );

  for (const atributo of entrada.atributos) {
    if (atributo.asignacion.clase !== "opcion" || atributo.asignacion.opcion.activa) continue;
    const clave = claveDeValor(atributo.atributoId, atributo.asignacion.opcion.id);
    if (!clavesExistentes.has(clave)) {
      throw conflicto(
        `La opción ${atributo.asignacion.opcion.id} está desactivada y no admite asignaciones nuevas.`,
      );
    }
  }
}

async function sincronizarAtributos(
  ejecutar: Ejecutor,
  entrada: EntradaDeProducto,
  existentes: readonly ValorExistente[],
) {
  const porClave = new Map(
    existentes.map((valor) => [claveDeValor(String(valor.attribute_id), valor.option_id), valor]),
  );
  const deseadas = entrada.atributos.map((atributo) => ({
    atributo,
    columnas: columnasDeAsignacion(atributo.tipo, atributo.asignacion),
  }));
  const clavesDeseadas = new Set(
    deseadas.map(({ atributo, columnas }) =>
      claveDeValor(atributo.atributoId, columnas.option_id),
    ),
  );

  for (const existente of existentes) {
    const clave = claveDeValor(String(existente.attribute_id), existente.option_id);
    if (!clavesDeseadas.has(clave)) {
      await ejecutar("delete from product_attribute_values where id = $1", [existente.id]);
    }
  }

  for (const { atributo, columnas } of deseadas) {
    const clave = claveDeValor(atributo.atributoId, columnas.option_id);
    const existente = porClave.get(clave);
    if (!existente) {
      await ejecutar(
        `insert into product_attribute_values (
           product_id, attribute_id, attribute_type, value_number, value_text, value_bool, option_id
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entrada.id,
          atributo.atributoId,
          atributo.tipo,
          columnas.value_number,
          columnas.value_text,
          columnas.value_bool,
          columnas.option_id,
        ],
      );
    } else if (existente.attribute_type !== atributo.tipo || !mismoValor(existente, columnas)) {
      await ejecutar(
        `update product_attribute_values
            set attribute_type = $2, value_number = $3, value_text = $4,
                value_bool = $5, option_id = $6
          where id = $1`,
        [
          existente.id,
          atributo.tipo,
          columnas.value_number,
          columnas.value_text,
          columnas.value_bool,
          columnas.option_id,
        ],
      );
    }
  }
}

function aPrecio(fila: Record<string, unknown>): Precio {
  return {
    id: String(fila.id),
    centavos: Number(fila.centavos),
    tipo: fila.tipo === "promocion" ? "promocion" : "normal",
    desde: fila.desde instanceof Date ? fila.desde : fila.desde ? new Date(String(fila.desde)) : null,
    hasta: fila.hasta instanceof Date ? fila.hasta : fila.hasta ? new Date(String(fila.hasta)) : null,
  };
}

async function sincronizarPrecio(
  ejecutar: Ejecutor,
  entrada: EntradaDeProducto,
  ahora: Date,
): Promise<number | null> {
  const actuales = (await ejecutar(
    `select id::text, centavos::text, tipo, lower(vigencia) as desde, upper(vigencia) as hasta
       from product_prices
      where product_id = $1 and vigencia @> $2::timestamptz
      order by lower(vigencia) desc`,
    [entrada.id, ahora],
  )).map(aPrecio);
  const normal = actuales.find((precio) => precio.tipo === "normal") ?? null;

  if (entrada.precioNormalCentavos === null) {
    return precioVigente(actuales, ahora)?.centavos ?? null;
  }

  if (normal?.centavos === entrada.precioNormalCentavos) {
    return precioVigente(actuales, ahora)?.centavos ?? entrada.precioNormalCentavos;
  }

  if (normal) {
    await ejecutar(
      `update product_prices
          set vigencia = tstzrange(lower(vigencia), $2::timestamptz, '[)')
        where id = $1`,
      [normal.id, ahora],
    );
  }

  await ejecutar(
    `insert into product_prices (product_id, centavos, tipo, vigencia)
     values ($1, $2, 'normal', tstzrange($3::timestamptz, null, '[)'))`,
    [entrada.id, entrada.precioNormalCentavos, ahora],
  );

  const paraProyeccion: Precio[] = [
    ...actuales.filter((precio) => precio.tipo !== "normal"),
    {
      id: "nuevo",
      centavos: entrada.precioNormalCentavos,
      tipo: "normal",
      desde: ahora,
      hasta: null,
    },
  ];
  return precioVigente(paraProyeccion, ahora)?.centavos ?? null;
}

function productoParaProyeccion(entrada: EntradaDeProducto): ProductRow {
  const visibles = entrada.imagenes
    .filter((imagen) => imagen.visible)
    .sort((a, b) => a.posicion - b.posicion);
  const principal = visibles.find((imagen) => imagen.principal);
  const adicionales = visibles.filter((imagen) => !imagen.principal).map((imagen) => imagen.url);

  return {
    id: entrada.id,
    ...entrada.nucleo,
    image: principal?.url ?? entrada.nucleo.image,
    images: adicionales.length > 0 ? adicionales : null,
    ...entrada.privados,
    price_gtq: null,
    stock: null,
    sellable_online: false,
  };
}

async function reconstruirProyeccion(
  ejecutar: Ejecutor,
  entrada: EntradaDeProducto,
  precioCentavos: number | null,
) {
  if (!entrada.nucleo.published) {
    await ejecutar("delete from public_products where id = $1", [entrada.id]);
    return;
  }

  const fila = aFilaProyeccion(
    fromProductRow(productoParaProyeccion(entrada)),
    precioCentavos === null ? null : aQuetzales(precioCentavos),
    entrada.nucleo.position,
  );
  const consulta = construirUpsertProyeccion(fila);
  await ejecutar(consulta.texto, consulta.parametros);
}

/**
 * Sincroniza un producto completo usando el ejecutor de la transacción que lo envuelve.
 * No abre conexiones y no confirma nada por su cuenta.
 */
export async function aplicarProducto(
  ejecutar: Ejecutor,
  entrada: EntradaDeProducto,
): Promise<void> {
  validarEntrada(entrada);
  const ahora = new Date();
  // Esta lectura ocurre antes de cualquier escritura porque decide si una opción
  // desactivada se conserva como valor histórico o se está intentando asignar de nuevo.
  const valoresExistentes = await leerValoresExistentes(ejecutar, entrada.id);
  validarActividadDeOpciones(entrada, valoresExistentes);

  await escribirNucleo(ejecutar, entrada);
  await escribirPrivados(ejecutar, entrada);
  await sincronizarCategorias(ejecutar, entrada);
  await sincronizarImagenes(ejecutar, entrada);
  await sincronizarAtributos(ejecutar, entrada, valoresExistentes);
  const precioCentavos = await sincronizarPrecio(ejecutar, entrada, ahora);
  await reconstruirProyeccion(ejecutar, entrada, precioCentavos);
  await ejecutar(
    `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, despues)
     values ($1, $2, 'sincronizar', 'producto', $3, $4::jsonb)`,
    [
      entrada.actor.tipo,
      entrada.actor.id,
      entrada.id,
      JSON.stringify({
        categorias: entrada.categorias.length,
        imagenes: entrada.imagenes.length,
        atributos: entrada.atributos.length,
        precioNormalCentavos: entrada.precioNormalCentavos,
        publicado: entrada.nucleo.published,
      }),
    ],
  );
}

export type EntradaDeAtributo = {
  clave: string;
  nombre: string;
  tipo: TipoDeAtributo;
  unidad: string | null;
};

export type EdicionDeAtributo = {
  nombre: string;
  unidad: string | null;
  filterable: boolean;
  comparable: boolean;
};

export type EntradaDeOpcion = { clave: string; etiqueta: string; posicion: number };

function textoObligatorio(valor: string, campo: string): string {
  const limpio = valor.trim();
  if (!limpio) throw conflicto(`${campo} no puede quedar vacío.`);
  return limpio;
}

export async function crearAtributo(
  ejecutar: Ejecutor,
  entrada: EntradaDeAtributo,
): Promise<string> {
  const clave = textoObligatorio(entrada.clave, "La clave").toLowerCase();
  const nombre = textoObligatorio(entrada.nombre, "El nombre");
  if (!TIPOS_DE_ATRIBUTO.includes(entrada.tipo)) {
    throw conflicto(`Tipo de atributo desconocido: ${String(entrada.tipo)}.`);
  }
  const filas = await ejecutar(
    `insert into attributes (clave, nombre, tipo, unidad)
     values ($1, $2, $3, $4)
     returning id::text`,
    [clave, nombre, entrada.tipo, entrada.unidad?.trim() || null],
  );
  if (!filas[0]?.id) throw new ErrorDeDatos("indisponible");
  return String(filas[0].id);
}

export async function editarAtributo(
  ejecutar: Ejecutor,
  id: string,
  entrada: EdicionDeAtributo,
): Promise<void> {
  await ejecutar(
    `update attributes
        set nombre = $2, unidad = $3, filterable = $4, comparable = $5,
            actualizado_en = now()
      where id = $1`,
    [
      id,
      textoObligatorio(entrada.nombre, "El nombre"),
      entrada.unidad?.trim() || null,
      entrada.filterable,
      entrada.comparable,
    ],
  );
}

async function bloquearDefinicion(
  ejecutar: Ejecutor,
  tabla: "attributes" | "attribute_options",
  id: string,
): Promise<void> {
  const filas = await ejecutar(`select id::text from ${tabla} where id = $1 for update`, [id]);
  if (!filas[0]) throw new ErrorDeDatos("no-encontrado");
}

export async function retirarAtributo(
  ejecutar: Ejecutor,
  id: string,
): Promise<"borrado" | "desactivado"> {
  await bloquearDefinicion(ejecutar, "attributes", id);
  const filas = await ejecutar(
    `select count(*)::int as usos
       from product_attribute_values
      where attribute_id = $1`,
    [id],
  );
  const decision = decidirRetirada(Number(filas[0]?.usos ?? 0));
  if (decision === "borrar") {
    await ejecutar("delete from attributes where id = $1", [id]);
    return "borrado";
  }
  await ejecutar("update attributes set active = false, actualizado_en = now() where id = $1", [id]);
  return "desactivado";
}

export async function crearOpcion(
  ejecutar: Ejecutor,
  atributoId: string,
  entrada: EntradaDeOpcion,
): Promise<string> {
  if (!Number.isInteger(entrada.posicion)) {
    throw conflicto("La posición de la opción debe ser un entero.");
  }
  const filas = await ejecutar(
    `insert into attribute_options (attribute_id, clave, etiqueta, posicion)
     values ($1, $2, $3, $4)
     returning id::text`,
    [
      atributoId,
      textoObligatorio(entrada.clave, "La clave").toLowerCase(),
      textoObligatorio(entrada.etiqueta, "La etiqueta"),
      entrada.posicion,
    ],
  );
  if (!filas[0]?.id) throw new ErrorDeDatos("indisponible");
  return String(filas[0].id);
}

export async function retirarOpcion(
  ejecutar: Ejecutor,
  id: string,
): Promise<"borrado" | "desactivado"> {
  await bloquearDefinicion(ejecutar, "attribute_options", id);
  const filas = await ejecutar(
    `select count(*)::int as usos
       from product_attribute_values
      where option_id = $1`,
    [id],
  );
  const decision = decidirRetirada(Number(filas[0]?.usos ?? 0));
  if (decision === "borrar") {
    await ejecutar("delete from attribute_options where id = $1", [id]);
    return "borrado";
  }
  await ejecutar(
    "update attribute_options set active = false, actualizado_en = now() where id = $1",
    [id],
  );
  return "desactivado";
}

export type EscrituraTransaccional = (
  trabajo: (ejecutar: Ejecutor) => Promise<void>,
  opciones?: { msMaximoPorSentencia?: number; suceso?: string },
) => Promise<void>;

/** Adaptador comprobable que deja la invalidación fuera y después de la transacción. */
export async function guardarProductoCon(
  escribir: EscrituraTransaccional,
  invalidarCache: () => void | Promise<void>,
  entrada: EntradaDeProducto,
): Promise<void> {
  await escribir((ejecutar) => aplicarProducto(ejecutar, entrada), {
    suceso: "guardar-producto-relacional",
  });
  await invalidarCache();
}
