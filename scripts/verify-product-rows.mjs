// Ensayo de la migración del catálogo, sin tocar la base de datos.
//
// La migración es una puerta de un solo sentido: hoy app/data/products.ts no
// guarda los productos, los fabrica (deduce acabados, nombres públicos y
// descripciones a partir de códigos del proveedor). Al pasar a base de datos
// esa fábrica se ejecuta por última vez y el resultado queda congelado como
// dato editable. Por eso conviene poder ensayarla cuantas veces haga falta.
//
// El método: convertir los 313 productos a filas, simular el viaje por
// Postgres, reconstruirlos y compararlos contra la foto congelada del catálogo
// con el mismo código que usa la importación de verdad.
//
// Uso:
//   npm run catalogo:verificar

import { products } from "../app/data/products.ts";
import { toPublicProduct } from "../app/data/publicProduct.ts";
import { fromProductRow, toProductRow } from "../app/data/productRow.ts";
import { compareCatalogs, reportProblems } from "./compare-catalog.mjs";

// Postgres no devuelve el objeto de JavaScript que se le pasó: las columnas
// jsonb viajan serializadas y vuelven analizadas, y de paso jsonb reordena las
// claves a su gusto. Aquí se reordenan a propósito EN SENTIDO INVERSO, que es
// el peor caso posible, para que el ensayo sea más exigente que la realidad.
// Si algo dependiera del orden de las claves, salta aquí y no en producción.
const shuffleKeys = (value) => {
  if (Array.isArray(value)) {
    // El orden de las listas sí se respeta: en jsonb los arrays son ordenados,
    // y en las imágenes el orden significa cuál es la principal.
    return value.map(shuffleKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, shuffleKeys(item)]),
    );
  }

  return value;
};

const throughDatabase = (row) => ({
  ...row,
  images: row.images === null ? null : JSON.parse(JSON.stringify(row.images)),
  technical_specs:
    row.technical_specs === null
      ? null
      : shuffleKeys(JSON.parse(JSON.stringify(row.technical_specs))),
});

const rows = products.map((product, index) => toProductRow(product, index));
const rebuilt = rows.map((row) => fromProductRow(throughDatabase(row)));

const problems = compareCatalogs(products, rebuilt);

// Las posiciones tienen que ser únicas y crecientes, o el catálogo saldría
// desordenado al leerse.
const positions = rows.map((row) => row.position);

if (new Set(positions).size !== positions.length) {
  problems.push("hay posiciones repetidas");
}

if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
  problems.push("las posiciones no van en orden creciente");
}

// La migración no puede empeorar la exposición del proveedor. Aquí no se
// comprueba que el catálogo esté limpio —hoy no lo está, y es un problema
// anterior que detalla scripts/audit-supplier-leaks.mjs— sino que el viaje por
// la base de datos no añada ni una aparición más.
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

console.log(`Productos leídos:      ${products.length}`);
console.log(`Filas generadas:       ${rows.length}`);
console.log(`Con galería:           ${rows.filter((row) => row.images !== null).length}`);
console.log(`Con ficha técnica:     ${rows.filter((row) => row.technical_specs !== null).length}`);
console.log(
  `Nombres de proveedor visibles hoy: ${leaksBefore} (problema anterior, ver catalogo:auditar)`,
);
console.log("");

reportProblems(
  problems,
  "OK: el viaje a la base de datos y de vuelta no pierde ni cambia nada.",
);
