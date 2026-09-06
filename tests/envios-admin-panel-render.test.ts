// tests/envios-admin-panel-render.test.ts
//
// Qué enseña la portada de /admin/envios. Se comprueba sobre el archivo, que es
// un componente de servidor y no se puede montar aquí: lo que importa es que las
// etiquetas y los valores sean los que ve una persona, no los técnicos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pagina = readFileSync("app/admin/(panel)/envios/page.tsx", "utf8");

test("los campos de dinero se piden en quetzales", () => {
  assert.match(pagina, /Tarifa fija \(Q\)/);
  assert.match(pagina, /Envío gratis a partir de \(Q\)/);
  assert.match(pagina, /name="tarifaQuetzales"/);
  assert.match(pagina, /name="umbralGratisQuetzales"/);
});

test("la pantalla no dice «centavos» ni «céntimos» en ninguna parte", () => {
  assert.equal(/c[eé]ntimo/i.test(pagina), false, "queda la palabra céntimo en la pantalla");
  assert.equal(/centavo/i.test(pagina), false, "queda la palabra centavo en la pantalla");
});

test("los valores técnicos 3500 y 250000 no se muestran", () => {
  assert.equal(pagina.includes("3500"), false, "3500 es el valor interno, no el que se escribe");
  assert.equal(pagina.includes("250000"), false, "250000 es el valor interno, no el que se escribe");
});

test("el importe se pinta con prefijo Q visible", () => {
  assert.match(pagina, /aQuetzales/, "los centavos guardados se convierten para pintarlos");
  assert.match(pagina, />Q</, "el prefijo Q acompaña al campo");
});

test("la recogida en tienda es un formulario, no una tarjeta que solo informa", () => {
  assert.match(pagina, /guardarRecogidaAction/);
  assert.match(pagina, /Ofrecer recogida en tienda/);
  assert.match(pagina, /Información para el cliente/);
  assert.match(pagina, /name="activa"/);
  assert.match(pagina, /name="texto"/);
  assert.match(pagina, /maxLength=\{200\}/);
  assert.match(pagina, /Guardar recogida/);
});

test("el estado actual de la recogida se ve de un vistazo", () => {
  assert.match(pagina, /recogida\.activa/);
});
