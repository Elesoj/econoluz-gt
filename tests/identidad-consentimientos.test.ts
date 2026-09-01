import assert from "node:assert/strict";
import { test } from "node:test";
import { esVersionValida, estaVigente } from "../app/identidad/consentimientos";

test("la versión es una fecha, que es como se publican los textos legales", () => {
  assert.equal(esVersionValida("2026-09-01"), true);
  assert.equal(esVersionValida("v1"), false);
  assert.equal(esVersionValida("2026-13-01"), false);
  assert.equal(esVersionValida(""), false);
  assert.equal(esVersionValida(null), false);
});

test("una aceptación sin revocar está vigente", () => {
  const filas = [{ tipo: "terminos", version: "2026-09-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), true);
});

test("una aceptación revocada ya no vale", () => {
  const filas = [{ tipo: "terminos", version: "2026-09-01", revocado_en: new Date() }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), false);
});

test("aceptar la versión de enero no acepta la de marzo", () => {
  const filas = [{ tipo: "terminos", version: "2026-01-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-03-01"), false);
});

test("cada tipo se cuenta por separado", () => {
  const filas = [{ tipo: "privacidad", version: "2026-09-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), false);
});
