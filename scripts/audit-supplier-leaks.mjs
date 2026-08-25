// Audita el catálogo público buscando datos que identifiquen al proveedor.
//
// Regla de negocio: el cliente no debe poder averiguar quién fabrica lo que
// vende ECONOLUZ, o se irá a comprarle directamente. `sanitizeSupplierText`
// en app/data/products.ts limpia las marcas (Artlite, Construlita, Highlum) y
// los códigos de referencia, pero no conoce los nombres de línea del
// fabricante (Corvus, Nanovia, Magnetrack Pro...), que siguen apareciendo en
// descripciones, etiquetas y fichas técnicas.
//
// Este script busca, dentro de todo lo que llega al navegador, cada marca y
// cada nombre de serie del proveedor, y dice exactamente dónde aparece.
//
// Uso:
//   node --import ./scripts/register-ts.mjs ./scripts/audit-supplier-leaks.mjs
//   node --import ./scripts/register-ts.mjs ./scripts/audit-supplier-leaks.mjs Corvus Nanovia

import { products } from "../app/data/products.ts";
import { toPublicProduct } from "../app/data/publicProduct.ts";

// Palabras demasiado genéricas para tratarlas como nombre de proveedor: son
// descripciones en español que ECONOLUZ usa por su cuenta y que casualmente
// coinciden con cómo el fabricante llamó a la línea.
const generic = /^(perfil|luminario|luminaria|tubo|tira|manguera|modulo|módulo|lampara|lámpara|downlight|panel|proyector|emergencia|senalizacion|señalizacion|poste|bolardo|arbotante|riel|placa|driver|kit|alto montaje|bajo montaje)/i;

const buildNeedles = () => {
  const needles = new Map();

  const add = (value, origin) => {
    const text = (value ?? "").trim();

    if (text.length < 4 || generic.test(text)) {
      return;
    }

    if (!needles.has(text)) {
      needles.set(text, new Set());
    }

    needles.get(text).add(origin);
  };

  for (const product of products) {
    add(product.supplierBrand, "marca");
    add(product.labels.brand, "marca");
    add(product.labels.series, "serie");
    add(product.supplierCode, "código");
    add(product.name, "nombre del fabricante");
  }

  return needles;
};

const walk = (value, path, visit) => {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, path ? `${path}.${key}` : key, visit);
    }
  }
};

const requested = process.argv.slice(2);
const needles = requested.length > 0
  ? new Map(requested.map((value) => [value, new Set(["pedido a mano"])]))
  : buildNeedles();

const findings = new Map();

for (const product of products) {
  const publicProduct = toPublicProduct(product);

  walk(publicProduct, "", (text, path) => {
    for (const needle of needles.keys()) {
      if (!text.includes(needle)) {
        continue;
      }

      if (!findings.has(needle)) {
        findings.set(needle, []);
      }

      findings.get(needle).push({ id: product.id, path, text });
    }
  });
}

// Agrupar por campo dice mucho más que la lista cruda: no es lo mismo que un
// nombre se cuele en la ruta de una imagen que en una etiqueta de filtro.
const byField = new Map();

for (const [needle, hits] of findings) {
  for (const hit of hits) {
    const field = hit.path.replace(/\[\d+\]/g, "[]");

    if (!byField.has(field)) {
      byField.set(field, { total: 0, needles: new Set() });
    }

    const entry = byField.get(field);
    entry.total += 1;
    entry.needles.add(needle);
  }
}

console.log(`Productos revisados:            ${products.length}`);
console.log(`Nombres de proveedor buscados:  ${needles.size}`);
console.log(`Nombres que sí aparecen:        ${findings.size}`);
console.log("");

if (findings.size === 0) {
  console.log("OK: el catálogo público no contiene ningún dato del proveedor.");
  process.exit(0);
}

console.log("Dónde aparecen, por campo:");
for (const [field, entry] of [...byField].sort((left, right) => right[1].total - left[1].total)) {
  console.log(
    `  ${field.padEnd(34)} ${String(entry.total).padStart(4)} apariciones, ` +
      `${entry.needles.size} nombre(s) distintos`,
  );
}

console.log("");
console.log("Ejemplos:");
for (const [needle, hits] of [...findings].sort((left, right) => right[1].length - left[1].length).slice(0, 12)) {
  const example = hits[0];
  console.log(`  "${needle}" (${hits.length}) -> ${example.id} . ${example.path}`);
  console.log(`      ${example.text.slice(0, 110)}`);
}
