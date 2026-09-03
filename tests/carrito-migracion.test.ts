import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Vigila el **texto** de `011`, igual que `catalogo-migracion` vigila el de `010`.
 *
 * No demuestra que PostgreSQL la acepte —eso lo hace aplicarla de verdad en la rama de
 * desarrollo—, pero impide que alguien quite una restricción sin enterarse.
 */
const RAIZ = join(import.meta.dirname, "..");
const sql = readFileSync(join(RAIZ, "db", "011_carrito.sql"), "utf8");

const bloqueDeTabla = (nombre: string): string => {
  const inicio = sql.indexOf(`create table if not exists ${nombre}`);
  assert.notEqual(inicio, -1, `falta la tabla ${nombre}`);
  return sql.slice(inicio, sql.indexOf(");", inicio));
};

const columnasDeTabla = (nombre: string): string[] =>
  [...bloqueDeTabla(nombre).matchAll(/^\s{2}([a-z_][a-z0-9_$]*)\s+[a-z]/gim)].map((m) => m[1]);

test("la migracion crea exactamente las dos tablas del diseno", () => {
  const creadas = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(creadas.sort(), ["cart_items", "carts"]);
});

test("es repetible: nada se crea sin «if not exists»", () => {
  assert.equal(/create table (?!if not exists)/i.test(sql), false);
  assert.equal(/create index (?!if not exists)/i.test(sql), false);
  assert.equal(/create unique index (?!if not exists)/i.test(sql), false);
});

test("un usuario no puede tener dos carritos", () => {
  assert.match(bloqueDeTabla("carts"), /user_id\s+bigint\s+not null unique references users\(id\)/i);
});

test("borrar al usuario se lleva su carrito", () => {
  assert.match(bloqueDeTabla("carts"), /references users\(id\)\s+on delete cascade/i);
});

test("el carrito guarda el token de la ultima fusion, para no repetirla", () => {
  assert.ok(columnasDeTabla("carts").includes("fusion_token"));
});

test("las dos tablas llevan fechas de creacion y de modificacion", () => {
  for (const tabla of ["carts", "cart_items"]) {
    const columnas = columnasDeTabla(tabla);
    assert.ok(columnas.includes("creado_en"), `${tabla} sin creado_en`);
    assert.ok(columnas.includes("actualizado_en"), `${tabla} sin actualizado_en`);
  }
});

test("una linea apunta a su carrito y a su producto, y los dos borran en cascada", () => {
  const bloque = bloqueDeTabla("cart_items");
  assert.match(bloque, /cart_id\s+bigint\s+not null references carts\(id\)\s+on delete cascade/i);
  assert.match(bloque, /product_id\s+text\s+not null references products\(id\)\s+on delete cascade/i);
});

test("una fila por producto dentro de cada carrito", () => {
  assert.match(bloqueDeTabla("cart_items"), /unique\s*\(\s*cart_id\s*,\s*product_id\s*\)/i);
});

test("la cantidad es un entero entre 1 y 999", () => {
  const bloque = bloqueDeTabla("cart_items");
  assert.match(bloque, /cantidad\s+integer\s+not null/i);
  assert.match(bloque, /check\s*\(\s*cantidad\s+between\s+1\s+and\s+999\s*\)/i);
});

/**
 * La regla del §5.4: el carrito guarda **qué y cuánto**, nada más. Un precio guardado aquí
 * sería un precio que el navegador podría llegar a fijar, y el importe se recalcula
 * siempre contra el catálogo del servidor.
 */
test("el carrito no guarda precios, nombres, imagenes, proveedor ni existencias", () => {
  const prohibidas = [
    "precio", "price", "price_cents", "price_gtq", "centavos", "importe", "total",
    "nombre", "public_name", "imagen", "image", "images",
    "supplier_code", "supplier_brand", "supplier_series", "supplier_name",
    "stock", "existencias", "disponible",
  ];
  const columnas = [...columnasDeTabla("carts"), ...columnasDeTabla("cart_items")];
  for (const prohibida of prohibidas) {
    assert.ok(!columnas.includes(prohibida), `«${prohibida}» no puede estar en el carrito`);
  }
});

/**
 * Una sentencia por tabla, y comprobada **línea a línea**: buscando con un comodín que
 * cruce saltos de línea, el `revoke` de `carts` y el de la secuencia de `cart_items`
 * bastarían para dar por buena una migración que dejó `cart_items` abierta. Se vio pasar
 * esa versión laxa antes de apretarla.
 */
test("el rol publico tiene denegadas las dos tablas de forma explicita", () => {
  const lineas = sql.split("\n").map((linea) => linea.trim());
  for (const tabla of ["carts", "cart_items"]) {
    assert.ok(
      lineas.includes(`revoke all on ${tabla} from econoluz_publico;`),
      `falta el revoke de ${tabla}`,
    );
  }
});

test("buscar las lineas de un carrito tiene indice", () => {
  assert.match(sql, /create index if not exists cart_items_cart_id_idx/i);
});

test("la migracion no toca ninguna tabla existente", () => {
  assert.equal(/alter table (?!.*(carts|cart_items))/i.test(sql), false);
  assert.equal(/drop\s+(table|column|index)/i.test(sql), false);
});
