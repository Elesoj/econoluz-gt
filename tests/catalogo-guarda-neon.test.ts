import assert from "node:assert/strict";
import { test } from "node:test";

import { decidirSiPuedeEscribir } from "../scripts/guarda-neon.mjs";

const DESARROLLO = "ep-catalogo-fase-b.c-11.us-east-1.aws.neon.tech";
const PRODUCCION = "ep-produccion.c-11.us-east-1.aws.neon.tech";

const entradaValida = {
  host: DESARROLLO,
  hostEsperado: DESARROLLO,
  hostProduccion: PRODUCCION,
  rama: "catalogo-relacional-fase-b",
  ramaEsperada: "catalogo-relacional-fase-b",
};

test("rechaza un host que no es el endpoint esperado", () => {
  const decision = decidirSiPuedeEscribir({ ...entradaValida, host: "ep-otra.neon.tech" });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /endpoint/i);
});

test("rechaza Producción aunque se configure también como endpoint esperado", () => {
  const decision = decidirSiPuedeEscribir({
    ...entradaValida,
    host: PRODUCCION,
    hostEsperado: PRODUCCION,
  });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /producci[oó]n/i);
});

test("rechaza cuando falta la identidad explícita de Producción", () => {
  const decision = decidirSiPuedeEscribir({ ...entradaValida, hostProduccion: "" });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /configuraci[oó]n/i);
});

test("rechaza cuando falta el marcador de rama", () => {
  const decision = decidirSiPuedeEscribir({ ...entradaValida, rama: null });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /sin marcar/i);
});

test("rechaza un marcador que pertenece a otra rama", () => {
  const decision = decidirSiPuedeEscribir({ ...entradaValida, rama: "otra-rama" });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /otra-rama/i);
});

test("reconoce como el mismo endpoint sus variantes directa y pooler", () => {
  const decision = decidirSiPuedeEscribir({
    ...entradaValida,
    host: "ep-catalogo-fase-b-pooler.c-11.us-east-1.aws.neon.tech",
  });

  assert.equal(decision.ok, true);
});

test("acepta solo cuando coinciden endpoint, marcador y rama esperada", () => {
  assert.deepEqual(decidirSiPuedeEscribir(entradaValida), { ok: true });
});
