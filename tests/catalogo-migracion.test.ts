import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const RUTA = join(RAIZ, "db", "010_catalogo_relacional.sql");
const sql = readFileSync(RUTA, "utf8");

function bloqueDeTabla(nombre: string): string {
  const inicio = sql.indexOf(`create table if not exists ${nombre}`);
  return sql.slice(inicio, sql.indexOf(");", inicio));
}

function columnasDeTabla(nombre: string): string[] {
  return [...bloqueDeTabla(nombre).matchAll(/^\s{2}([a-z_][a-z0-9_$]*)\s+[a-z]/gim)].map(
    (coincidencia) => coincidencia[1],
  );
}

/** `_` y `$` forman parte de un identificador SQL sin comillas y no son límites. */
function contieneIdentificadorSql(texto: string, identificador: string): boolean {
  const escapado = identificador.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9_$])${escapado}(?![a-z0-9_$])`, "i").test(texto);
}

/** Las ocho del diseño aprobado. `public_products` ya existe y no es de este subproyecto. */
const TABLAS = [
  "categories",
  "product_categories",
  "product_private_data",
  "product_images",
  "attributes",
  "attribute_options",
  "product_attribute_values",
  "product_prices",
];

test("la migracion crea exactamente las ocho tablas del diseno", () => {
  const creadas = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);

  assert.deepEqual([...creadas].sort(), [...TABLAS].sort());
});

/**
 * El diseño lo prohíbe expresamente: una categoría clasifica productos, no determina qué
 * características puede tener uno. Al editar un producto el administrador elige sus
 * atributos, con independencia de las categorías.
 */
test("category_attributes no existe en ninguna forma", () => {
  assert.equal(/category_attributes/.test(sql), false);
});

// ---------------------------------------------------------------------------
// Datos privados del proveedor
// ---------------------------------------------------------------------------

test("product_private_data guarda los siete campos del diseno y ninguno mas", () => {
  const columnas = columnasDeTabla("product_private_data");

  assert.deepEqual([...columnas].sort(), [
    "product_id",
    "supplier_brand",
    "supplier_brand_label",
    "supplier_code",
    "supplier_description",
    "supplier_name",
    "supplier_series",
    "supplier_series_label",
  ].sort());
});

/**
 * `sku` y `productCode` son alias del mismo dato que `supplier_code`. Crear columnas
 * separadas para ellos es duplicar el código con el que ECONOLUZ vende, y garantiza que
 * algún día discrepen.
 */
test("no se duplica el codigo del proveedor en sku ni product_code", () => {
  const columnas = columnasDeTabla("product_private_data").join(" ");
  assert.equal(contieneIdentificadorSql(columnas, "sku"), false);
  assert.equal(contieneIdentificadorSql(columnas, "product_code"), false);
});

test("el guardian distingue supplier_sku de una columna sku real", () => {
  assert.equal(contieneIdentificadorSql("supplier_sku sku_interno", "sku"), false);
  assert.equal(contieneIdentificadorSql("supplier_code sku supplier_name", "sku"), true);
});

test("supplier_code es buscable y NO es unique", () => {
  assert.match(sql, /create index if not exists [\w]*supplier_code[\w]*\s+on product_private_data/);
  // Hay registros con varios códigos separados por barras: no puede ser único.
  assert.equal(/supplier_code[^\n]*unique/i.test(sql), false);
});

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

test("la categoria principal se busca con un indice no unico", () => {
  assert.doesNotMatch(
    sql,
    /create unique index if not exists product_categories_[\w]*principal/i,
  );
  assert.match(sql, /create index if not exists product_categories_principal_idx/);
  assert.match(sql, /on product_categories \(product_id\)\s*\n\s*where principal;/);
});

/**
 * El índice único parcial impide que haya DOS, pero no puede exigir que haya UNA: sobre cero
 * filas marcadas no hay nada que comparar. El diseño pide una comprobación **diferible**,
 * para poder reemplazar las categorías de un producto dentro de una transacción sin pasar
 * por estados intermedios inválidos.
 */
test("cero, una y mas de una principal se comprueban al confirmar", () => {
  assert.match(sql, /create constraint trigger/i);
  assert.match(sql, /deferrable initially deferred/i);
  assert.match(sql, /if total > 0 and principales <> 1 then/i);
  assert.match(
    sql,
    /from products\s+where id = producto\s+for update/i,
    "La comprobación debe serializar las escrituras concurrentes del mismo producto",
  );
});

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

test("no puede haber dos imagenes en la misma posicion ni dos principales", () => {
  assert.match(sql, /unique \(product_id, posicion\)/);
  assert.match(sql, /create unique index if not exists product_images_una_principal/);
});

/**
 * Una restricción inmediata comprueba cada fila mientras avanza el `UPDATE`: al intercambiar
 * las posiciones 10 y 20, la primera fila choca con la segunda antes de que esta se mueva.
 * La unicidad tiene que comprobarse sobre el estado final de la transacción.
 */
test("se pueden intercambiar dos posiciones de imagenes en un solo UPDATE", () => {
  const bloque = sql.slice(
    sql.indexOf("create table if not exists product_images"),
    sql.indexOf(");", sql.indexOf("create table if not exists product_images")),
  );

  assert.match(
    bloque,
    /constraint product_images_posicion_unica\s+unique \(product_id, posicion\)\s+deferrable initially deferred/i,
  );
});

test("borrar un producto no borra en cascada sus referencias de imagen", () => {
  const bloque = sql.slice(
    sql.indexOf("create table if not exists product_images"),
    sql.indexOf(");", sql.indexOf("create table if not exists product_images")),
  );

  assert.match(
    bloque,
    /product_id\s+text\s+not null references products\(id\) on delete restrict/i,
  );
});

// ---------------------------------------------------------------------------
// Atributos y sus opciones
// ---------------------------------------------------------------------------

test("los atributos y las opciones se pueden desactivar", () => {
  const atributos = sql.slice(sql.indexOf("create table if not exists attributes"));
  assert.match(atributos, /active\s+boolean\s+not null default true/);

  const opciones = sql.slice(sql.indexOf("create table if not exists attribute_options"));
  assert.match(opciones, /active\s+boolean\s+not null default true/);
});

/**
 * Cambiar el tipo de un atributo usado reinterpretaría los valores ya guardados sin
 * tocarlos. La clave foránea compuesta con `on update restrict` hace que **lo rechace la
 * base**, no un `if` que alguien pueda olvidar.
 */
test("el tipo de un atributo usado es inmutable, y lo impide la base", () => {
  assert.match(sql, /unique \(id, tipo\)/);
  assert.match(sql, /\(attribute_id, attribute_type\)[\s\S]{0,120}references attributes \(id, tipo\)/);
  assert.match(sql, /on update restrict/);
});

test("una opcion tiene que pertenecer al atributo del valor", () => {
  assert.match(sql, /unique \(id, attribute_id\)/);
  assert.match(
    sql,
    /\(option_id, attribute_id\)[\s\S]{0,140}references attribute_options \(id, attribute_id\)/,
  );
});

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

test("exactamente una columna de valor puede estar llena", () => {
  assert.match(sql, /constraint product_attribute_values_una_columna check/);
  assert.match(sql, /= 1\s*\)/);
});

test("la columna llena tiene que corresponder al tipo del atributo", () => {
  assert.match(sql, /constraint product_attribute_values_columna_del_tipo check/);
});

test("un atributo escalar admite un solo valor por producto", () => {
  assert.match(sql, /create unique index if not exists product_attribute_values_escalar_unico/);
  assert.match(sql, /where attribute_type <> 'opcion_multiple'/);
});

test("la misma opcion no se puede elegir dos veces", () => {
  assert.match(sql, /unique \(product_id, attribute_id, option_id\)/);
});

test("los dos indices que abaratan el filtrado estan declarados", () => {
  assert.match(sql, /product_attribute_values \(attribute_id, value_number\)/);
  assert.match(sql, /product_attribute_values \(attribute_id, option_id\)/);
});

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

test("la base impide dos promociones solapadas, no solo la aplicacion", () => {
  assert.match(sql, /exclude using gist/);
  assert.match(sql, /vigencia\s+with &&/);
  assert.match(sql, /where \(tipo = 'promocion'\)/);
  assert.match(sql, /create extension if not exists btree_gist/);
});

// ---------------------------------------------------------------------------
// Invariantes generales
// ---------------------------------------------------------------------------

/**
 * `products.id` es TEXT —un identificador heredado como 'construlita-cuasar'—, no un
 * entero. Una clave foránea declarada como `bigint` hace fallar la migración entera al
 * aplicarse, y eso solo se descubre al aplicarla.
 */
test("las claves foraneas hacia products son del tipo de products.id", () => {
  const productos = readFileSync(join(RAIZ, "db", "002_products.sql"), "utf8");
  assert.match(productos, /^\s*id\s+text\s+primary key/m, "products.id dejó de ser text");

  const referencias = [...sql.matchAll(/^\s*product_id\s+(\w+)[^\n]*references products\(id\)/gm)].map(
    (m) => m[1],
  );

  assert.equal(referencias.length > 0, true, "No se encontró ninguna columna product_id");
  assert.deepEqual([...new Set(referencias)], ["text"]);
});

test("la migracion no borra nada", () => {
  for (const destructivo of [
    /drop\s+table/i,
    /drop\s+column/i,
    /truncate/i,
    /delete\s+from/i,
    /alter\s+table\s+products\b/i,
  ]) {
    assert.equal(destructivo.test(sql), false, `La migración no puede contener ${destructivo}`);
  }
});

test("la cabecera distingue la rama de desarrollo de Producción", () => {
  assert.match(sql, /APLICADA SOLO EN LA RAMA DE DESARROLLO/);
  assert.match(sql, /NO ESTÁ APLICADA EN PRODUCCIÓN/);
});

test("las migraciones se descubren sin huecos e incluyen la 010", () => {
  const archivosSql = readdirSync(join(RAIZ, "db")).filter((archivo) => archivo.endsWith(".sql"));
  const migraciones = archivosSql.map((archivo) => archivo.match(/^(\d{3})_[a-z0-9_]+\.sql$/i));

  assert.equal(
    migraciones.every((coincidencia) => coincidencia !== null),
    true,
    "Todos los archivos SQL deben llamarse NNN_descripcion.sql",
  );

  const numeros = migraciones
    .map((coincidencia) => Number(coincidencia?.[1]))
    .sort((a, b) => a - b);
  const ultimo = numeros.at(-1) ?? 0;
  const secuenciaEsperada = Array.from({ length: ultimo }, (_, indice) => indice + 1);

  assert.equal(numeros.includes(10), true, "La migración 010 debe existir");
  assert.deepEqual(numeros, secuenciaEsperada);
});
