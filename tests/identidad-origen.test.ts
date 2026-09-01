import assert from "node:assert/strict";
import { test } from "node:test";
import { esMismoOrigen } from "../app/identidad/origen";

test("acepta una mutación que viene del mismo host", () => {
  assert.equal(esMismoOrigen("https://econoluz.example", "econoluz.example"), true);
});

test("rechaza otro host aunque la ruta y el cuerpo parezcan válidos", () => {
  assert.equal(esMismoOrigen("https://malicioso.example", "econoluz.example"), false);
});

test("el puerto forma parte del host y también debe coincidir", () => {
  assert.equal(esMismoOrigen("http://localhost:3000", "localhost:3000"), true);
  assert.equal(esMismoOrigen("http://localhost:4000", "localhost:3000"), false);
});

test("sin cabeceras o con un origen malformado se rechaza", () => {
  assert.equal(esMismoOrigen(null, "econoluz.example"), false);
  assert.equal(esMismoOrigen("https://econoluz.example", null), false);
  assert.equal(esMismoOrigen("no es una URL", "econoluz.example"), false);
});
