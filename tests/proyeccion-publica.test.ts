import assert from "node:assert/strict";
import { test } from "node:test";
import { products } from "../app/data/products";
import { toPublicProduct } from "../app/data/publicProduct";
import { positionForIndex } from "../app/data/productRow";
import { aFilaProyeccion, desdeFilaProyeccion } from "../app/data/proyeccionPublica";

test("los 313 productos proyectados son idénticos a la salida pública de hoy", () => {
  for (const [indice, producto] of products.entries()) {
    const esperado = toPublicProduct(producto);
    const obtenido = desdeFilaProyeccion(
      aFilaProyeccion(producto, null, positionForIndex(indice)),
    );
    assert.deepEqual(obtenido, esperado, `difiere en ${producto.econoluzReference}`);
  }
});

test("un precio positivo se conserva exacto en centavos y vuelve igual", () => {
  for (const [quetzales, centavos] of [
    [0.01, 1],
    [125.5, 12550],
    [1250.5, 125050],
    [150, 15000],
  ] as const) {
    const fila = aFilaProyeccion(products[0], quetzales, 10);
    assert.equal(fila.price_cents, centavos);
    assert.equal(desdeFilaProyeccion(fila).priceGtq, quetzales);
  }
});

test("ningún importe no comprable llega a la proyección", () => {
  // Misma regla que `toPublicProduct` y que el motor del carrito desde el
  // commit 2b32049: solo un número finito y mayor que cero es un precio. Cero
  // regalaría el producto; `NaN` e `Infinity` envenenarían el total del carrito.
  for (const invalido of [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    const fila = aFilaProyeccion(products[0], invalido, 10);
    assert.equal(fila.price_cents, null, `${invalido} no debería proyectarse`);
    assert.equal("priceGtq" in desdeFilaProyeccion(fila), false);
  }
});

test("una fila con centavos inválidos tampoco reconstruye precio", () => {
  // Defensa por si algo escribiera en la tabla saltándose el escritor: la
  // restricción de la base ya lo impide, pero la lectura no se fía.
  for (const invalido of [0, -50, Number.NaN]) {
    const fila = { ...aFilaProyeccion(products[0], 150, 10), price_cents: invalido };
    assert.equal("priceGtq" in desdeFilaProyeccion(fila), false);
  }
});

/**
 * Misma normalización que usa `npm run catalogo:auditar`: tildes fuera,
 * minúsculas y solo letras y dígitos, para que «Magnetrack-Pro» y
 * «magnetrack pro» se comparen igual. El rango \u0300-\u036f son los signos
 * diacríticos combinados que deja `normalize("NFD")`; hay que escribirlo con
 * escapes, no con los caracteres literales, o el patrón se corrompe al copiarlo.
 */
const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Mismas exclusiones que ya usa `npm run catalogo:auditar`
// (scripts/audit-supplier-leaks.mjs): algunas series del proveedor se llaman
// igual que vocabulario normal del sector ("Emergencia" es la línea de
// emergencia de un fabricante, pero también la aplicación pública legítima de
// otros productos). Sin esta lista, la prueba confundiría una palabra
// genérica del catálogo con una fuga real del proveedor.
const GENERICO_NORMALIZADO_PREFIJOS = [
  "perfil",
  "luminario",
  "luminaria",
  "tubo",
  "tira",
  "manguera",
  "modulo",
  "lampara",
  "downlight",
  "panel",
  "proyector",
  "emergencia",
  "senalizacion",
  "poste",
  "bolardo",
  "arbotante",
  "riel",
  "placa",
  "driver",
  "kit",
  "altomontaje",
  "bajomontaje",
];

// Coinciden con nombres de serie, pero son vocabulario normal del sector o
// del español (mismo listado que `safePublicTerms` en
// scripts/audit-supplier-leaks.mjs). Quitarlos de la comparación no oculta al
// fabricante: son palabras que el catálogo público ya usa por su cuenta.
const TERMINOS_PUBLICOS_SEGUROS = new Set(
  [
    "Bronce",
    "Wallpack",
    "Wallpack CCT",
    "Uplight",
    "Landscape",
    "Slim",
    "Bright",
    "Canopy CCT",
    "Spotlight COB",
    "Module",
    "Sombra",
  ].map(normalizar),
);

test("ninguna fila proyectada lleva marca, serie ni código del proveedor", () => {
  const identificadores = new Set<string>();
  for (const producto of products) {
    for (const valor of [
      producto.supplierBrand,
      producto.labels.brand,
      producto.labels.series,
      producto.series,
      producto.supplierCode,
    ]) {
      const normalizado = normalizar(valor);
      const esGenerico =
        GENERICO_NORMALIZADO_PREFIJOS.some((prefijo) => normalizado.startsWith(prefijo)) ||
        TERMINOS_PUBLICOS_SEGUROS.has(normalizado);
      // Un código puramente numérico ("3011") no identifica al proveedor: es
      // indistinguible de cualquier otro número que aparezca en el catálogo
      // por casualidad (referencias, medidas...). El audit real exige al
      // menos una letra por el mismo motivo.
      const tieneLetra = /[a-z]/.test(normalizado);
      if (normalizado.length >= 4 && !esGenerico && tieneLetra) {
        identificadores.add(normalizado);
      }
    }
  }

  for (const [indice, producto] of products.entries()) {
    const texto = normalizar(
      JSON.stringify(aFilaProyeccion(producto, null, positionForIndex(indice))),
    );
    for (const identificador of identificadores) {
      assert.ok(
        !texto.includes(identificador),
        `${producto.econoluzReference} filtra «${identificador}»`,
      );
    }
  }
});
