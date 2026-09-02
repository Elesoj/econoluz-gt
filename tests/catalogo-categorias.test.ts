import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hayCiclo,
  rutaDeCategoria,
  validarPertenencias,
  type Categoria,
} from "../app/data/catalogo/categorias";

// ---------------------------------------------------------------------------
// Exactamente una categoría principal cuando hay categorías
// ---------------------------------------------------------------------------

const en = (categoriaId: string, principal = false) => ({ categoriaId, principal });

/**
 * Un producto sin clasificar es un producto a medio cargar, no un dato inválido: se admite.
 * La regla solo se activa en cuanto tiene al menos una categoría.
 */
test("un producto sin categorias es valido", () => {
  assert.equal(validarPertenencias([]).ok, true);
});

test("con una categoria, esa tiene que ser la principal", () => {
  assert.equal(validarPertenencias([en("cat-techo", true)]).ok, true);
});

/**
 * El caso que el índice único parcial NO puede impedir: cero principales. Por eso el diseño
 * pide además una comprobación diferible al cerrar la transacción.
 */
test("con categorias pero ninguna principal se rechaza", () => {
  const resultado = validarPertenencias([en("cat-techo"), en("cat-led")]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /ninguna|una principal/i);
});

test("dos principales se rechazan", () => {
  const resultado = validarPertenencias([en("cat-techo", true), en("cat-led", true)]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /una categoría principal/i);
});

test("varias categorias con una sola principal es lo normal y vale", () => {
  assert.equal(
    validarPertenencias([en("cat-techo", true), en("cat-led"), en("cat-exterior")]).ok,
    true,
  );
});

test("la misma categoria dos veces se rechaza", () => {
  const resultado = validarPertenencias([en("cat-techo", true), en("cat-techo")]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /repetid/i);
});

// ---------------------------------------------------------------------------
// El árbol
// ---------------------------------------------------------------------------

const arbol: Categoria[] = [
  { id: "raiz", parentId: null, nombre: "Iluminación" },
  { id: "interior", parentId: "raiz", nombre: "Interior" },
  { id: "techo", parentId: "interior", nombre: "Techo" },
];

test("un arbol normal no tiene ciclos", () => {
  assert.equal(hayCiclo(arbol), false);
});

test("una categoria que cuelga de si misma es un ciclo", () => {
  assert.equal(hayCiclo([{ id: "a", parentId: "a", nombre: "A" }]), true);
});

test("un ciclo indirecto tambien se detecta", () => {
  assert.equal(
    hayCiclo([
      { id: "a", parentId: "b", nombre: "A" },
      { id: "b", parentId: "c", nombre: "B" },
      { id: "c", parentId: "a", nombre: "C" },
    ]),
    true,
  );
});

test("un padre inexistente es un dato roto, pero no un ciclo", () => {
  assert.equal(hayCiclo([{ id: "a", parentId: "fantasma", nombre: "A" }]), false);
});

test("la ruta va de la raiz a la categoria pedida", () => {
  assert.deepEqual(
    rutaDeCategoria(arbol, "techo").map((categoria) => categoria.id),
    ["raiz", "interior", "techo"],
  );
});

test("la ruta de la raiz es solo la raiz", () => {
  assert.deepEqual(rutaDeCategoria(arbol, "raiz").map((c) => c.id), ["raiz"]);
});

test("una categoria que no existe no tiene ruta", () => {
  assert.deepEqual(rutaDeCategoria(arbol, "fantasma"), []);
});

/**
 * Si los datos llegaran con un ciclo, recorrer padres colgaría el servidor. Prefiero que
 * devuelva una ruta corta a que se quede dando vueltas.
 */
test("la ruta no se cuelga si los datos traen un ciclo", () => {
  const roto: Categoria[] = [
    { id: "a", parentId: "b", nombre: "A" },
    { id: "b", parentId: "a", nombre: "B" },
  ];

  const ruta = rutaDeCategoria(roto, "a");
  assert.equal(ruta.length <= roto.length, true);
});
