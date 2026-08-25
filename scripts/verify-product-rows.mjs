// Comprueba que llevar el catálogo a la base de datos no pierde ni deforma
// ningún dato, ANTES de tocar la base de datos de verdad.
//
// La migración es una puerta de un solo sentido: hoy app/data/products.ts no
// guarda los productos, los fabrica (deduce acabados, nombres públicos y
// descripciones a partir de códigos del proveedor). Al pasar a base de datos
// esa fábrica se ejecuta por última vez y el resultado queda congelado como
// dato editable. Por eso hay que verificarla al detalle.
//
// El método: convertir los 313 productos a filas, simular el viaje de ida y
// vuelta por Postgres, reconstruirlos y compararlos contra la foto congelada
// que ya protege el catálogo (tests/fixtures/catalog-baseline.json).
//
// Uso:
//   node --import ./scripts/register-ts.mjs ./scripts/verify-product-rows.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { products } from "../app/data/products.ts";
import { toPublicProduct } from "../app/data/publicProduct.ts";
import { fromProductRow, toProductRow } from "../app/data/productRow.ts";
import { verifyCatalogBaseline } from "../tests/helpers/catalog-baseline.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  readFileSync(join(projectRoot, "tests/fixtures/catalog-baseline.json"), "utf8"),
);

// Postgres no devuelve el objeto de JavaScript que se le pasó: las columnas
// jsonb viajan serializadas y vuelven analizadas de nuevo. Simularlo aquí
// evita descubrir en producción que algo no sobrevive al viaje.
const throughDatabase = (row) => ({
  ...row,
  images: row.images === null ? null : JSON.parse(JSON.stringify(row.images)),
  technical_specs:
    row.technical_specs === null ? null : JSON.parse(JSON.stringify(row.technical_specs)),
});

const rows = products.map((product, index) => toProductRow(product, index));
const rebuilt = rows.map((row) => fromProductRow(throughDatabase(row)));

const problems = [];

// --- 1. El catálogo reconstruido contra la foto congelada -----------------
problems.push(...verifyCatalogBaseline(rebuilt, baseline));

// --- 2. Campo por campo, para poder señalar qué se rompió -----------------
// La comprobación anterior detecta cualquier cambio, pero solo dice "el hash
// no coincide". Esta dice exactamente en qué producto y en qué campo.
const canonical = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

for (const [index, original] of products.entries()) {
  const copy = rebuilt[index];

  for (const key of new Set([...Object.keys(original), ...Object.keys(copy)])) {
    if (JSON.stringify(original[key]) !== JSON.stringify(copy[key])) {
      problems.push(
        `campo distinto tras el viaje: ${original.id}.${key}\n` +
          `      antes: ${canonical(original[key])}\n` +
          `      ahora: ${canonical(copy[key])}`,
      );
    }
  }
}

// --- 3. El payload público, que es lo único que llega al navegador --------
for (const [index, original] of products.entries()) {
  const before = JSON.stringify(toPublicProduct(original));
  const after = JSON.stringify(toPublicProduct(rebuilt[index]));

  if (before !== after) {
    problems.push(`el producto público cambia para ${original.id}`);
  }
}

// --- 4. Las posiciones tienen que ser únicas y estar en orden -------------
const positions = rows.map((row) => row.position);

if (new Set(positions).size !== positions.length) {
  problems.push("hay posiciones repetidas");
}

if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
  problems.push("las posiciones no van en orden creciente");
}

// --- 5. La migración no puede empeorar la exposición del proveedor --------
// Aquí no se comprueba que el catálogo esté limpio: hoy no lo está, y eso es
// un problema anterior a esta migración (lo detalla
// `scripts/audit-supplier-leaks.mjs`). Lo que se comprueba es que el viaje
// por la base de datos no añada ni una aparición más.
const countLeaks = (catalog) => {
  const supplierValues = new Set();

  for (const product of catalog) {
    for (const value of [
      product.supplierBrand,
      product.labels.brand,
      product.labels.series,
      product.supplierCode,
      product.name,
    ]) {
      if (value && value.length > 3) {
        supplierValues.add(value);
      }
    }
  }

  const payload = JSON.stringify(catalog.map((product) => toPublicProduct(product)));

  return [...supplierValues].filter((value) => payload.includes(value)).length;
};

const leaksBefore = countLeaks(products);
const leaksAfter = countLeaks(rebuilt);

if (leaksAfter !== leaksBefore) {
  problems.push(
    `la exposición del proveedor cambia: ${leaksBefore} nombres antes, ${leaksAfter} después`,
  );
}

// --- Resultado ------------------------------------------------------------
console.log(`Productos leídos:      ${products.length}`);
console.log(`Filas generadas:       ${rows.length}`);
console.log(`Con galería:           ${rows.filter((row) => row.images !== null).length}`);
console.log(`Con ficha técnica:     ${rows.filter((row) => row.technical_specs !== null).length}`);
console.log(`Nombres de proveedor visibles hoy: ${leaksBefore} (problema anterior, ver audit-supplier-leaks)`);
console.log("");

if (problems.length > 0) {
  console.error(`FALLO: ${problems.length} problema(s)\n`);
  for (const problem of problems.slice(0, 40)) {
    console.error(`  - ${problem}`);
  }
  if (problems.length > 40) {
    console.error(`  ... y ${problems.length - 40} más`);
  }
  process.exit(1);
}

console.log("OK: el viaje a la base de datos y de vuelta no pierde ni cambia nada.");
