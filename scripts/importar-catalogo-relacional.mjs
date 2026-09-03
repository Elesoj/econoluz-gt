// Importa el catálogo legado al núcleo relacional sin activar todavía su lectura pública.

import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";

import {
  CLAVES_NUMERICAS,
  NOMBRES_DE_ATRIBUTO,
  UNIDADES_NUMERICAS,
  categoriasDelCatalogo,
  claveDeAtributo,
  planificarProducto,
} from "../app/data/catalogo/importacion.ts";
import { aplicarProducto } from "../app/data/catalogo/escritura.ts";
import { productoCoincideConEntrada } from "../app/data/catalogo/idempotencia.ts";
import { leerProductoRelacional } from "../app/data/catalogo/lectura.ts";
import { autorizarEscritura, exigirDestinoDeLectura } from "./guarda-neon.mjs";

/** La palabra literal que hay que escribir para importar en Producción. */
export const CONFIRMACION_PRODUCCION = "importar-relacional-en-produccion";

const TABLAS_DE_RESUMEN = [
  "products",
  "categories",
  "product_categories",
  "product_private_data",
  "product_images",
  "attributes",
  "attribute_options",
  "product_attribute_values",
  "product_prices",
  "public_products",
];

const COLUMNAS_DE_FILA = `
  id, econoluz_reference, position, public_name, public_description, image, images,
  technical_specs, product_type, product_type_label, application, application_label,
  finish, finish_label, family_label, supplier_brand, supplier_brand_label,
  supplier_series, supplier_series_label, supplier_code, supplier_name,
  supplier_description, price_gtq, published
`;

const texto = (valor) => (valor === null || valor === undefined ? "" : String(valor));

export function normalizarFilaDeCatalogo(fila) {
  return {
    id: texto(fila.id),
    econoluz_reference: texto(fila.econoluz_reference),
    position: Number(fila.position),
    public_name: texto(fila.public_name),
    public_description: texto(fila.public_description),
    image: texto(fila.image),
    images: Array.isArray(fila.images) ? fila.images.map(String) : null,
    technical_specs:
      fila.technical_specs && typeof fila.technical_specs === "object"
        ? fila.technical_specs
        : null,
    product_type: texto(fila.product_type),
    product_type_label: texto(fila.product_type_label),
    application: texto(fila.application),
    application_label: texto(fila.application_label),
    finish: texto(fila.finish),
    finish_label: texto(fila.finish_label),
    family_label: texto(fila.family_label),
    supplier_brand: texto(fila.supplier_brand),
    supplier_brand_label: texto(fila.supplier_brand_label),
    supplier_series: texto(fila.supplier_series),
    supplier_series_label: texto(fila.supplier_series_label),
    supplier_code: texto(fila.supplier_code),
    supplier_name: texto(fila.supplier_name),
    supplier_description: texto(fila.supplier_description),
    price_gtq:
      fila.price_gtq === null || fila.price_gtq === undefined ? null : Number(fila.price_gtq),
    published: Boolean(fila.published),
  };
}

async function obtenerId(ejecutar, insercion, parametros, seleccion, clave) {
  const filas = await ejecutar(insercion, parametros);
  if (filas[0]?.id !== undefined) return String(filas[0].id);
  const existentes = await ejecutar(seleccion, [clave]);
  if (existentes[0]?.id === undefined) throw new Error(`No se pudo resolver «${clave}».`);
  return String(existentes[0].id);
}

async function prepararCategorias(ejecutar, filas) {
  const ids = new Map();
  for (const categoria of categoriasDelCatalogo(filas)) {
    const parentId = categoria.parentSlug ? ids.get(categoria.parentSlug) : null;
    if (categoria.parentSlug && !parentId) {
      throw new Error(`No se resolvió la categoría padre «${categoria.parentSlug}».`);
    }
    const id = await obtenerId(
      ejecutar,
      `insert into categories (parent_id, slug, nombre, posicion, publicada)
       values ($1, $2, $3, $4, true)
       on conflict (slug) do update set
         parent_id = excluded.parent_id,
         nombre = excluded.nombre,
         posicion = excluded.posicion,
         publicada = true,
         actualizado_en = now()
       where row(categories.parent_id, categories.nombre, categories.posicion, categories.publicada)
          is distinct from row(excluded.parent_id, excluded.nombre, excluded.posicion, true)
       returning id::text`,
      [parentId, categoria.slug, categoria.nombre, categoria.posicion],
      "select id::text from categories where slug = $1",
      categoria.slug,
    );
    ids.set(categoria.slug, id);
  }
  return ids;
}

async function prepararAtributos(ejecutar) {
  const ids = new Map();
  for (const claveOriginal of CLAVES_NUMERICAS) {
    const clave = claveDeAtributo(claveOriginal);
    const id = await obtenerId(
      ejecutar,
      `insert into attributes (clave, nombre, tipo, unidad, active)
       values ($1, $2, 'numero', $3, true)
       on conflict (clave) do update set
         nombre = excluded.nombre,
         unidad = excluded.unidad,
         active = true,
         actualizado_en = now()
       where attributes.tipo = 'numero'
         and row(attributes.nombre, attributes.unidad, attributes.active)
          is distinct from row(excluded.nombre, excluded.unidad, true)
       returning id::text`,
      [clave, NOMBRES_DE_ATRIBUTO[claveOriginal], UNIDADES_NUMERICAS[claveOriginal]],
      "select id::text from attributes where clave = $1 and tipo = 'numero'",
      clave,
    );
    ids.set(clave, id);
  }
  return ids;
}

function construirEntrada(fila, plan, categorias, atributos) {
  return {
    id: fila.id,
    nucleo: {
      econoluz_reference: fila.econoluz_reference,
      position: fila.position,
      public_name: fila.public_name,
      public_description: fila.public_description,
      image: fila.image,
      images: fila.images,
      technical_specs: fila.technical_specs,
      product_type: fila.product_type,
      product_type_label: fila.product_type_label,
      application: fila.application,
      application_label: fila.application_label,
      finish: fila.finish,
      finish_label: fila.finish_label,
      family_label: fila.family_label,
      published: fila.published,
    },
    privados: plan.privados,
    categorias: plan.categorias.map((categoria) => ({
      categoriaId: categorias.get(categoria.slug),
      principal: categoria.principal,
    })),
    imagenes: plan.imagenes,
    atributos: plan.atributos.map((atributo) => ({
      atributoId: atributos.get(atributo.clave),
      tipo: "numero",
      asignacion: { clase: "escalar", valor: atributo.numero },
    })),
    precioNormalCentavos: plan.precioNormalCentavos,
    actor: { tipo: "sistema", id: null },
  };
}

async function resumen(ejecutar) {
  const conteos = {};
  for (const tabla of TABLAS_DE_RESUMEN) {
    const filas = await ejecutar(`select count(*)::integer as total from ${tabla}`);
    conteos[tabla] = Number(filas[0]?.total ?? 0);
  }
  const [{ huella }] = await ejecutar(`
    with contenido as (
      select 'categories' as tabla, (to_jsonb(t) - 'creado_en' - 'actualizado_en')::text as fila from categories t
      union all select 'product_categories', to_jsonb(t)::text from product_categories t
      union all select 'product_private_data', to_jsonb(t)::text from product_private_data t
      union all select 'product_images', (to_jsonb(t) - 'creado_en')::text from product_images t
      union all select 'attributes', (to_jsonb(t) - 'creado_en' - 'actualizado_en')::text from attributes t
      union all select 'attribute_options', (to_jsonb(t) - 'creado_en' - 'actualizado_en')::text from attribute_options t
      union all select 'product_attribute_values', to_jsonb(t)::text from product_attribute_values t
      union all select 'product_prices', (to_jsonb(t) - 'creado_en')::text from product_prices t
      union all select 'public_products', (to_jsonb(t) - 'updated_at')::text from public_products t
    )
    select md5(coalesce(string_agg(tabla || ':' || fila, E'\n' order by tabla, fila), '')) as huella
      from contenido
  `);
  return { conteos, huella: String(huella) };
}

async function ejecutarImportacion(ejecutar, simular) {
  const filas = (await ejecutar(`select ${COLUMNAS_DE_FILA} from products order by position, id`))
    .map(normalizarFilaDeCatalogo);
  const planes = filas.map((fila) => ({ fila, plan: planificarProducto(fila) }));
  const rechazados = planes
    .filter(({ plan }) => plan.rechazos.length > 0)
    .map(({ fila, plan }) => ({ id: fila.id, rechazos: plan.rechazos }));
  const aceptados = planes.filter(({ plan }) => plan.rechazos.length === 0);

  const antes = await resumen(ejecutar);
  const categorias = await prepararCategorias(ejecutar, filas);
  const atributos = await prepararAtributos(ejecutar);
  const ahora = new Date();
  let modificados = 0;
  let omitidos = 0;

  for (const { fila, plan } of aceptados) {
    const entrada = construirEntrada(fila, plan, categorias, atributos);
    if (entrada.categorias.some((categoria) => !categoria.categoriaId)) {
      throw new Error(`El producto ${fila.id} tiene una categoría sin resolver.`);
    }
    if (entrada.atributos.some((atributo) => !atributo.atributoId)) {
      throw new Error(`El producto ${fila.id} tiene un atributo sin resolver.`);
    }

    const actual = await leerProductoRelacional(ejecutar, fila.id);
    if (productoCoincideConEntrada(actual, entrada, ahora)) {
      omitidos += 1;
      continue;
    }
    await aplicarProducto(ejecutar, entrada);
    modificados += 1;
  }

  // La simulación fuerza aquí las restricciones diferidas antes del rollback.
  if (simular) await ejecutar("set constraints all immediate");
  const despues = await resumen(ejecutar);

  return {
    modo: simular ? "simulacion" : "importacion",
    fuente: filas.length,
    aceptados: aceptados.length,
    rechazados,
    previstos: {
      categorias: categoriasDelCatalogo(filas).length,
      imagenes: aceptados.reduce((total, { plan }) => total + plan.imagenes.length, 0),
      atributos: CLAVES_NUMERICAS.length,
      valores: aceptados.reduce((total, { plan }) => total + plan.atributos.length, 0),
      privados: aceptados.length,
      precios: aceptados.filter(({ plan }) => plan.precioNormalCentavos !== null).length,
    },
    modificados,
    omitidos,
    antes,
    despues,
  };
}

export async function importarCatalogoRelacional({
  simular,
  produccion = false,
  entorno = process.env,
}) {
  if (!entorno.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: entorno.DATABASE_URL, max: 1 });
  const cliente = await pool.connect();
  let transaccion = false;
  try {
    // Simular no escribe nada fuera de una transacción que se revierte, pero sí tiene que
    // saber a qué base está hablando: una simulación contra la base equivocada mide otra
    // cosa y da confianza falsa.
    if (simular) {
      await exigirDestinoDeLectura(cliente, entorno, produccion ? "produccion" : "desarrollo");
    } else {
      await autorizarEscritura(cliente, {
        modo: produccion ? "aplicar-produccion" : "aplicar",
        entorno,
        confirmacionEsperada: CONFIRMACION_PRODUCCION,
      });
    }
    await cliente.query("begin");
    transaccion = true;
    await cliente.query("set local statement_timeout = 60000");
    const ejecutar = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;
    const resultado = await ejecutarImportacion(ejecutar, simular);
    await cliente.query(simular ? "rollback" : "commit");
    transaccion = false;
    return resultado;
  } catch (error) {
    if (transaccion) await cliente.query("rollback");
    throw error;
  } finally {
    cliente.release();
    await pool.end();
  }
}

async function ejecutarDesdeTerminal() {
  const argumentos = new Set(process.argv.slice(2));
  const simular = argumentos.has("--simular");
  const produccion = argumentos.has("--produccion");
  if (!simular && !argumentos.has("--importar")) {
    throw new Error("Usa --simular o --importar.");
  }
  const resultado = await importarCatalogoRelacional({ simular, produccion });
  console.log(JSON.stringify(resultado, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarDesdeTerminal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
