// Verificación estructural y campo a campo del catálogo relacional en la rama aislada.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import { planificarProducto } from "../app/data/catalogo/importacion.ts";
import { buscarPorCodigoDeProveedor } from "../app/data/catalogo/lectura.ts";
import { fromProductRow } from "../app/data/productRow.ts";
import { aFilaProyeccion } from "../app/data/proyeccionPublica.ts";
import { decidirDestinoDeLectura, exigirDestinoDeLectura } from "./guarda-neon.mjs";
import { normalizarFilaDeCatalogo } from "./importar-catalogo-relacional.mjs";

const TABLAS_NUEVAS = [
  "attribute_options",
  "attributes",
  "categories",
  "product_attribute_values",
  "product_categories",
  "product_images",
  "product_prices",
  "product_private_data",
];

const COLUMNAS_PRIVADAS = [
  "product_id",
  "supplier_brand",
  "supplier_brand_label",
  "supplier_code",
  "supplier_description",
  "supplier_name",
  "supplier_series",
  "supplier_series_label",
];

const COLUMNAS_FUENTE = `
  id, econoluz_reference, position, public_name, public_description, image, images,
  technical_specs, product_type, product_type_label, application, application_label,
  finish, finish_label, family_label, supplier_brand, supplier_brand_label,
  supplier_series, supplier_series_label, supplier_code, supplier_name,
  supplier_description, price_gtq, published
`;

function canonizar(valor) {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, contenido]) => [clave, canonizar(contenido)]),
    );
  }
  return valor;
}

const iguales = (a, b) => JSON.stringify(canonizar(a)) === JSON.stringify(canonizar(b));
const clavesDistintas = (actual, esperado) =>
  [...new Set([...Object.keys(actual ?? {}), ...Object.keys(esperado ?? {})])]
    .filter((clave) => !iguales(actual?.[clave], esperado?.[clave]));
const agrupar = (filas, clave) => {
  const mapa = new Map();
  for (const fila of filas) {
    const id = String(fila[clave]);
    const grupo = mapa.get(id) ?? [];
    grupo.push(fila);
    mapa.set(id, grupo);
  }
  return mapa;
};

const filaPublica = (fila) => ({
  id: String(fila.id),
  econoluz_reference: String(fila.econoluz_reference),
  position: Number(fila.position),
  public_name: String(fila.public_name),
  public_description: String(fila.public_description),
  image: String(fila.image),
  images: Array.isArray(fila.images) ? fila.images.map(String) : null,
  product_type: String(fila.product_type),
  application: String(fila.application),
  finish: String(fila.finish),
  label_product_type: String(fila.label_product_type),
  label_application: String(fila.label_application),
  label_finish: String(fila.label_finish),
  technical_specs: fila.technical_specs ?? null,
  price_cents: fila.price_cents === null ? null : Number(fila.price_cents),
});

function agregarFallo(fallos, condicion, mensaje) {
  if (!condicion) fallos.push(mensaje);
}

export async function verificarCatalogoRelacional(
  cliente,
  entorno = process.env,
  destino = "desarrollo",
) {
  const ejecutar = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;
  const fallos = [];

  await exigirDestinoDeLectura(cliente, entorno, destino);

  const tablas = (await ejecutar(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'`,
  )).map((fila) => String(fila.table_name));
  for (const tabla of TABLAS_NUEVAS) agregarFallo(fallos, tablas.includes(tabla), `falta ${tabla}`);
  agregarFallo(fallos, !tablas.includes("category_attributes"), "existe category_attributes");

  const columnasPrivadas = (await ejecutar(
    `select column_name
       from information_schema.columns
      where table_schema = 'public' and table_name = 'product_private_data'
      order by column_name`,
  )).map((fila) => String(fila.column_name));
  agregarFallo(
    fallos,
    iguales(columnasPrivadas, [...COLUMNAS_PRIVADAS].sort()),
    `columnas privadas inesperadas: ${columnasPrivadas.join(", ")}`,
  );

  const [{ extension_ok }] = await ejecutar(
    "select exists(select 1 from pg_extension where extname = 'btree_gist') as extension_ok",
  );
  agregarFallo(fallos, Boolean(extension_ok), "btree_gist no está instalada");

  const indices = await ejecutar(
    `select ci.relname as nombre, i.indisunique as unico, pg_get_indexdef(i.indexrelid) as definicion
       from pg_index i
       join pg_class ci on ci.oid = i.indexrelid
      where ci.relname in (
        'product_private_data_supplier_code_idx',
        'product_categories_principal_idx',
        'product_images_una_principal',
        'product_attribute_values_escalar_unico',
        'product_attribute_values_numero_idx',
        'product_attribute_values_opcion_idx'
      )`,
  );
  const indice = new Map(indices.map((fila) => [String(fila.nombre), fila]));
  agregarFallo(
    fallos,
    indice.get("product_private_data_supplier_code_idx")?.unico === false,
    "el índice de supplier_code falta o es único",
  );
  agregarFallo(
    fallos,
    indice.get("product_categories_principal_idx")?.unico === false,
    "el índice de categoría principal falta o es único inmediato",
  );
  for (const nombre of [
    "product_images_una_principal",
    "product_attribute_values_escalar_unico",
    "product_attribute_values_numero_idx",
    "product_attribute_values_opcion_idx",
  ]) {
    agregarFallo(fallos, indice.has(nombre), `falta el índice ${nombre}`);
  }

  const restricciones = await ejecutar(
    `select conname, condeferrable, condeferred, confdeltype
       from pg_constraint
      where conname in (
        'product_images_posicion_unica',
        'product_images_product_id_fkey',
        'product_attribute_values_una_columna',
        'product_attribute_values_columna_del_tipo',
        'product_attribute_values_atributo_fk',
        'product_attribute_values_opcion_fk',
        'product_prices_sin_promociones_solapadas'
      )`,
  );
  const restriccion = new Map(restricciones.map((fila) => [String(fila.conname), fila]));
  const posicion = restriccion.get("product_images_posicion_unica");
  agregarFallo(
    fallos,
    posicion?.condeferrable === true && posicion?.condeferred === true,
    "la posición de imágenes no es DEFERRABLE INITIALLY DEFERRED",
  );
  agregarFallo(
    fallos,
    restriccion.get("product_images_product_id_fkey")?.confdeltype === "r",
    "la FK de product_images no usa ON DELETE RESTRICT",
  );
  for (const nombre of [
    "product_attribute_values_una_columna",
    "product_attribute_values_columna_del_tipo",
    "product_attribute_values_atributo_fk",
    "product_attribute_values_opcion_fk",
    "product_prices_sin_promociones_solapadas",
  ]) {
    agregarFallo(fallos, restriccion.has(nombre), `falta la restricción ${nombre}`);
  }

  const disparadores = await ejecutar(
    `select tgdeferrable, tginitdeferred
       from pg_trigger
      where tgname = 'product_categories_principal_obligatoria' and not tgisinternal`,
  );
  agregarFallo(
    fallos,
    disparadores.length === 1 &&
      disparadores[0].tgdeferrable === true &&
      disparadores[0].tginitdeferred === true,
    "el trigger de categoría principal no es diferido inicialmente",
  );

  const [{ migracion_010, modelo, rama }] = await ejecutar(`
    select
      (select count(*)::integer from schema_migrations where filename = '010_catalogo_relacional.sql') as migracion_010,
      (select valor from app_settings where clave = 'modelo_catalogo') as modelo,
      (select valor from app_settings where clave = 'rama_neon') as rama
  `);
  agregarFallo(fallos, Number(migracion_010) === 1, "010 no está registrada exactamente una vez");
  // Desde la Fase C la bandera puede estar en `shadow` en la rama de desarrollo. Lo que
  // sigue prohibido, y por eso se comprueba, es `relational_v2`: eso es la Fase D.
  agregarFallo(
    fallos,
    modelo === "legacy" || modelo === "shadow",
    `modelo_catalogo vale ${String(modelo)}`,
  );
  agregarFallo(fallos, rama === entorno.NEON_RAMA_ESPERADA, `marcador de rama inesperado: ${String(rama)}`);

  const permisos = await ejecutar(
    `select tabla,
            has_table_privilege('econoluz_publico', format('public.%I', tabla), 'select') as puede_leer
       from unnest($1::text[]) as tabla`,
    [[...TABLAS_NUEVAS, "public_products"]],
  );
  for (const permiso of permisos) {
    const debeLeer = permiso.tabla === "public_products";
    agregarFallo(
      fallos,
      Boolean(permiso.puede_leer) === debeLeer,
      `permiso SELECT incorrecto para econoluz_publico sobre ${String(permiso.tabla)}`,
    );
  }

  const [fuenteRaw, categoriasRaw, privadosRaw, pertenenciasRaw, imagenesRaw, atributosRaw, preciosRaw, publicasRaw] =
    await Promise.all([
      ejecutar(`select ${COLUMNAS_FUENTE} from products order by position, id`),
      ejecutar("select id::text, slug from categories"),
      ejecutar("select * from product_private_data"),
      ejecutar(`select pc.product_id, c.slug, pc.principal
                  from product_categories pc join categories c on c.id = pc.category_id`),
      ejecutar(`select product_id, url, alt, posicion, visible, principal
                  from product_images order by product_id, posicion`),
      ejecutar(`select pav.product_id, a.clave, a.nombre, a.unidad, a.tipo,
                       pav.value_number, pav.value_text, pav.value_bool, pav.option_id::text
                  from product_attribute_values pav join attributes a on a.id = pav.attribute_id
                 order by pav.product_id, a.clave`),
      ejecutar(`select product_id, centavos::text, tipo, lower(vigencia) as desde, upper(vigencia) as hasta
                  from product_prices order by product_id, lower(vigencia)`),
      ejecutar("select * from public_products order by position, id"),
    ]);

  const fuente = fuenteRaw.map(normalizarFilaDeCatalogo);
  const privados = new Map(privadosRaw.map((fila) => [String(fila.product_id), fila]));
  const pertenencias = agrupar(pertenenciasRaw, "product_id");
  const imagenes = agrupar(imagenesRaw, "product_id");
  const atributos = agrupar(atributosRaw, "product_id");
  const precios = agrupar(preciosRaw, "product_id");
  const publicas = new Map(publicasRaw.map((fila) => [String(fila.id), filaPublica(fila)]));
  const slugs = new Set(categoriasRaw.map((fila) => String(fila.slug)));
  const rechazos = [];

  for (const fila of fuente) {
    const plan = planificarProducto(fila);
    if (plan.rechazos.length > 0) rechazos.push({ id: fila.id, rechazos: plan.rechazos });

    const privado = privados.get(fila.id);
    agregarFallo(fallos, Boolean(privado), `${fila.id}: falta la fila privada`);
    if (privado) {
      const campos = Object.fromEntries(
        Object.entries(privado).filter(([clave]) => clave !== "product_id"),
      );
      agregarFallo(fallos, iguales(campos, plan.privados), `${fila.id}: difieren los datos privados`);
    }

    const categoriasEsperadas = plan.categorias
      .map((categoria) => ({ slug: categoria.slug, principal: categoria.principal }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const categoriasActuales = (pertenencias.get(fila.id) ?? [])
      .map((categoria) => ({ slug: String(categoria.slug), principal: Boolean(categoria.principal) }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    agregarFallo(fallos, iguales(categoriasActuales, categoriasEsperadas), `${fila.id}: difieren las categorías`);
    agregarFallo(
      fallos,
      categoriasActuales.filter((categoria) => categoria.principal).length === 1,
      `${fila.id}: no tiene exactamente una categoría principal`,
    );
    for (const categoria of categoriasEsperadas) {
      agregarFallo(fallos, slugs.has(categoria.slug), `${fila.id}: no existe ${categoria.slug}`);
    }

    const imagenesActuales = (imagenes.get(fila.id) ?? []).map((imagen) => ({
      url: String(imagen.url),
      alt: String(imagen.alt),
      posicion: Number(imagen.posicion),
      visible: Boolean(imagen.visible),
      principal: Boolean(imagen.principal),
    }));
    agregarFallo(fallos, iguales(imagenesActuales, plan.imagenes), `${fila.id}: difieren las imágenes`);

    const atributosActuales = (atributos.get(fila.id) ?? []).map((atributo) => ({
      clave: String(atributo.clave),
      nombre: String(atributo.nombre),
      unidad: atributo.unidad === null ? null : String(atributo.unidad),
      numero: atributo.value_number === null ? null : Number(atributo.value_number),
    }));
    agregarFallo(fallos, iguales(atributosActuales, plan.atributos), `${fila.id}: difieren los atributos`);

    const preciosActuales = (precios.get(fila.id) ?? []).map((precio) => ({
      centavos: Number(precio.centavos),
      tipo: String(precio.tipo),
    }));
    const preciosEsperados = plan.precioNormalCentavos === null
      ? []
      : [{ centavos: plan.precioNormalCentavos, tipo: "normal" }];
    agregarFallo(fallos, iguales(preciosActuales, preciosEsperados), `${fila.id}: difiere el precio`);

    const productoParaProyeccion = {
      ...fila,
      image: plan.imagenes.find((imagen) => imagen.principal)?.url ?? fila.image,
      images: plan.imagenes.filter((imagen) => !imagen.principal).map((imagen) => imagen.url) || null,
      stock: null,
      sellable_online: false,
    };
    if (productoParaProyeccion.images.length === 0) productoParaProyeccion.images = null;
    const publicaEsperada = aFilaProyeccion(
      fromProductRow(productoParaProyeccion),
      plan.precioNormalCentavos === null ? null : plan.precioNormalCentavos / 100,
      fila.position,
    );
    agregarFallo(
      fallos,
      iguales(publicas.get(publicaEsperada.id), publicaEsperada),
      `${fila.id}: difiere public_products (${clavesDistintas(publicas.get(publicaEsperada.id), publicaEsperada).join(", ")})`,
    );
  }

  const ejemploCodigo = fuente.find((fila) => fila.supplier_code.trim().length > 0);
  let busquedaPrivada = null;
  if (ejemploCodigo) {
    const resultados = await buscarPorCodigoDeProveedor(ejecutar, ejemploCodigo.supplier_code);
    const encontrado = resultados.some((resultado) => resultado.id === ejemploCodigo.id);
    busquedaPrivada = { coincidencias: resultados.length, encontrado };
    agregarFallo(
      fallos,
      encontrado,
      "supplier_code no se puede buscar desde la conexión administrativa",
    );
  }

  const conteos = {
    products: fuente.length,
    categories: categoriasRaw.length,
    product_categories: pertenenciasRaw.length,
    product_private_data: privadosRaw.length,
    product_images: imagenesRaw.length,
    attributes: Number((await ejecutar("select count(*) from attributes"))[0].count),
    attribute_options: Number((await ejecutar("select count(*) from attribute_options"))[0].count),
    product_attribute_values: atributosRaw.length,
    product_prices: preciosRaw.length,
    public_products: publicasRaw.length,
  };

  return {
    ok: fallos.length === 0,
    fallos,
    conteos,
    rechazados: rechazos,
    migracion_010: Number(migracion_010),
    modelo,
    rama,
    btree_gist: Boolean(extension_ok),
    busquedaPrivada,
    permisosPublicos: permisos.map((permiso) => ({
      tabla: String(permiso.tabla),
      puedeLeer: Boolean(permiso.puede_leer),
    })),
  };
}

async function ejecutarDesdeTerminal() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    await cliente.query("begin transaction isolation level repeatable read read only");
    const resultado = await verificarCatalogoRelacional(
      cliente,
      process.env,
      decidirDestinoDeLectura(process.argv.slice(2)),
    );
    await cliente.query("rollback");
    console.log(JSON.stringify(resultado, null, 2));
    if (!resultado.ok) process.exitCode = 1;
  } catch (error) {
    await cliente.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarDesdeTerminal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
