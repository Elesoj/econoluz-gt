import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const RUTA = join(RAIZ, "db", "010_catalogo_relacional.sql");
const sql = readFileSync(RUTA, "utf8");

test("la migracion 010 declara las nueve tablas del diseno", () => {
  const tablas = [
    "categories",
    "product_categories",
    "product_private_data",
    "product_images",
    "attributes",
    "attribute_options",
    "category_attributes",
    "product_attribute_values",
    "product_prices",
  ];

  for (const tabla of tablas) {
    assert.match(sql, new RegExp(`create table if not exists ${tabla}\\b`), `Falta ${tabla}`);
  }
});

/**
 * Lo que hace posible filtrar «entre 15 y 25 W»: el valor va en la columna de su tipo, y
 * en una sola. La regla vive también en `app/data/catalogo/atributos.ts`, pero una que solo
 * vigile la aplicación acaba incumpliéndose desde un script.
 */
test("exactamente una columna de valor puede estar llena", () => {
  assert.match(sql, /constraint product_attribute_values_una_columna check/);
  assert.match(sql, /= 1\s*\)/);
});

test("los dos indices que abaratan el filtrado estan declarados", () => {
  assert.match(sql, /product_attribute_values \(attribute_id, value_number\)/);
  assert.match(sql, /product_attribute_values \(attribute_id, option_id\)/);
});

/**
 * «Una sola categoría principal» no se consigue con un `check`: se consigue con un índice
 * único parcial sobre las filas marcadas.
 */
test("un producto no puede tener dos categorias principales", () => {
  assert.match(sql, /create unique index if not exists product_categories_una_principal/);
  assert.match(sql, /on product_categories \(product_id\)\s*\n\s*where principal;/);
});

test("la base impide dos promociones solapadas, no solo la aplicacion", () => {
  assert.match(sql, /exclude using gist/);
  assert.match(sql, /vigencia\s+with &&/);
  assert.match(sql, /where \(tipo = 'promocion'\)/);
  // La restricción de exclusión sobre (texto, rango) necesita esta extensión.
  assert.match(sql, /create extension if not exists btree_gist/);
});

/**
 * `products.id` es TEXT —un identificador heredado como 'construlita-cuasar'—, no un
 * entero. Una clave foránea declarada como `bigint` hace fallar la migración entera al
 * aplicarse, y eso solo se descubre al aplicarla.
 */
test("las claves foraneas hacia products son del tipo de products.id", () => {
  const productos = readFileSync(join(RAIZ, "db", "002_products.sql"), "utf8");
  assert.match(productos, /^\s*id\s+text\s+primary key/m, "products.id dejó de ser text");

  // Solo definiciones de columna: `product_id with =` de la restricción de exclusión no
  // declara ningún tipo y no debe contarse.
  const referencias = [...sql.matchAll(/^\s*product_id\s+(\w+)[^\n]*references products\(id\)/gm)].map(
    (m) => m[1],
  );
  assert.equal(referencias.length > 0, true, "No se encontró ninguna columna product_id");
  assert.deepEqual(
    [...new Set(referencias)],
    ["text"],
    "Alguna clave foránea hacia products no es text y la migración fallaría al aplicarse.",
  );
});

/**
 * «Ninguna migración destructiva mientras se prueba»: el modelo viejo se conserva entero y
 * retirarlo es el subproyecto 11, con autorización expresa.
 */
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

test("la migracion sigue sin aplicarse y lo dice en su cabecera", () => {
  assert.match(sql, /NO ESTÁ APLICADA/);
});

test("010 es la ultima migracion y no se salta ningun numero", () => {
  const numeros = readdirSync(join(RAIZ, "db"))
    .filter((archivo) => archivo.endsWith(".sql"))
    .map((archivo) => Number(archivo.slice(0, 3)))
    .sort((a, b) => a - b);

  assert.deepEqual(numeros, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
