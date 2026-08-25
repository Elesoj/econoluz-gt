// Compara un catálogo reconstruido contra el catálogo del código y contra la
// foto congelada de tests/fixtures/catalog-baseline.json.
//
// Vive aquí y no dentro de cada script para que la comprobación de ensayo
// (verify-product-rows, sin base de datos) y la de verdad (import-products,
// leyendo de Neon) sean literalmente el mismo código. Si fueran dos copias,
// podrían dejar de coincidir justo en lo que importa.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toPublicProduct } from "../app/data/publicProduct.ts";
import { verifyCatalogBaseline } from "../tests/helpers/catalog-baseline.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const loadBaseline = () =>
  JSON.parse(readFileSync(join(projectRoot, "tests/fixtures/catalog-baseline.json"), "utf8"));

// Postgres guarda la ficha técnica en una columna jsonb, y jsonb no conserva
// el orden en que se escribieron las claves: lo decide él. Comparar con
// JSON.stringify a secas daría 261 diferencias falsas donde los datos son
// idénticos y solo cambió el orden.
//
// Ignorar ese orden es seguro, y no por comodidad: el orden en que la ficha
// llega al navegador NO sale del almacenamiento. `toPublicProduct` reconstruye
// technicalSpecs recorriendo PUBLIC_TECHNICAL_SPEC_REGISTRY, una lista fija,
// así que el cliente siempre ve los datos en el mismo orden venga de donde
// venga. Las huellas de la foto congelada también ordenan las claves antes de
// calcularse. Aun así, esto solo relaja el orden de las CLAVES: el orden de
// las listas (las imágenes, por ejemplo) sí se compara tal cual, porque ahí
// el orden sí significa algo.
const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }

  return value;
};

const sameValue = (left, right) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export const compareCatalogs = (original, rebuilt) => {
  const problems = [];

  // 1. Contra la foto congelada: detecta cualquier cambio, aunque sea en un
  //    producto que no estemos mirando.
  problems.push(...verifyCatalogBaseline(rebuilt, loadBaseline()));

  // 2. Campo por campo: dice exactamente qué producto y qué campo cambió,
  //    que es lo que hace falta para arreglarlo.
  for (const [index, before] of original.entries()) {
    const after = rebuilt[index];

    if (!after) {
      problems.push(`falta el producto ${before.id}`);
      continue;
    }

    if (before.id !== after.id) {
      problems.push(`el orden cambió: en la posición ${index} se esperaba ${before.id} y hay ${after.id}`);
      continue;
    }

    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!sameValue(before[key], after[key])) {
        problems.push(
          `campo distinto: ${before.id}.${key}\n` +
            `      antes: ${JSON.stringify(canonical(before[key]))?.slice(0, 200)}\n` +
            `      ahora: ${JSON.stringify(canonical(after[key]))?.slice(0, 200)}`,
        );
      }
    }
  }

  // 3. El payload público, que es lo único que llega al navegador. Aquí sí se
  //    compara tal cual, sin ordenar nada: tiene que ser idéntico byte a byte.
  for (const [index, before] of original.entries()) {
    if (!rebuilt[index]) {
      continue;
    }

    if (JSON.stringify(toPublicProduct(before)) !== JSON.stringify(toPublicProduct(rebuilt[index]))) {
      problems.push(`el producto público cambia para ${before.id}`);
    }
  }

  return problems;
};

export const reportProblems = (problems, successMessage) => {
  if (problems.length === 0) {
    console.log(successMessage);
    return;
  }

  console.error(`FALLO: ${problems.length} problema(s)\n`);

  for (const problem of problems.slice(0, 30)) {
    console.error(`  - ${problem}`);
  }

  if (problems.length > 30) {
    console.error(`  ... y ${problems.length - 30} más`);
  }

  process.exit(1);
};
