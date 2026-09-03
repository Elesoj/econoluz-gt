import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONFIRMACION_PRODUCCION,
  decidirEscrituraEnProduccion,
  planDeLimpieza,
  resumirPlan,
} from "../scripts/limpiar-galerias-duplicadas.mjs";

const base = {
  id: "p-1",
  econoluz_reference: "ECO-CAT-0059",
  image: "/catalogos/construlita/bronce/eco-exterior-002.webp",
  images: null as string[] | null,
};

test("un producto sin galería no se toca", () => {
  assert.equal(planDeLimpieza({ ...base, images: null }), null);
});

test("una galería vacía no se toca", () => {
  assert.equal(planDeLimpieza({ ...base, images: [] }), null);
});

test("una galería que no repite la principal no se toca", () => {
  const otra = "/catalogos/construlita/bronce/eco-exterior-003.webp";
  assert.equal(planDeLimpieza({ ...base, images: [otra] }), null);
});

test("la galería que es solo la repetición se queda en null, no en lista vacía", () => {
  const plan = planDeLimpieza({ ...base, images: [base.image] });
  assert.ok(plan);
  assert.equal(plan.nuevas, null);
  assert.deepEqual(plan.original, [base.image]);
  assert.equal(plan.referencia, "ECO-CAT-0059");
  assert.equal(plan.imagen, base.image);
});

test("una fotografía secundaria distinta se conserva intacta", () => {
  const otra = "/catalogos/construlita/alto_montaje/eco-industrial-002.webp";
  const plan = planDeLimpieza({ ...base, images: [base.image, otra] });
  assert.ok(plan);
  assert.deepEqual(plan.nuevas, [otra]);
});

test("se quitan todas las repeticiones de la principal, no solo la primera", () => {
  const otra = "/catalogos/construlita/bronce/eco-exterior-003.webp";
  const plan = planDeLimpieza({ ...base, images: [base.image, otra, base.image] });
  assert.ok(plan);
  assert.deepEqual(plan.nuevas, [otra]);
});

test("solo se quita la coincidencia exacta: una ruta parecida se conserva", () => {
  const parecida = base.image.replace(".webp", "-2.webp");
  const casi = base.image.toUpperCase();
  const plan = planDeLimpieza({ ...base, images: [parecida, casi] });
  assert.equal(plan, null, "no debe tocar rutas que solo se parecen");
});

test("el orden de las fotografías conservadas no cambia", () => {
  const a = "/catalogos/x/a.webp";
  const b = "/catalogos/x/b.webp";
  const plan = planDeLimpieza({ ...base, images: [a, base.image, b] });
  assert.ok(plan);
  assert.deepEqual(plan.nuevas, [a, b]);
});

// --- El camino explícito hacia Producción -------------------------------------------

const PROD = "ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech";
const DEV = "ep-green-union-avi3x99e.c-11.us-east-1.aws.neon.tech";

test("sin confirmación explícita no se escribe en Producción", () => {
  const decision = decidirEscrituraEnProduccion({
    host: PROD,
    hostProduccion: PROD,
    confirmacion: undefined,
  });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /confirmaci/i);
});

test("una confirmación equivocada tampoco vale", () => {
  for (const confirmacion of ["si", "SI", "produccion", CONFIRMACION_PRODUCCION.toUpperCase()]) {
    const decision = decidirEscrituraEnProduccion({
      host: PROD,
      hostProduccion: PROD,
      confirmacion,
    });
    assert.equal(decision.ok, false, `${confirmacion} no debería valer`);
  }
});

test("este camino no puede tocar la rama de desarrollo por equivocación", () => {
  const decision = decidirEscrituraEnProduccion({
    host: DEV,
    hostProduccion: PROD,
    confirmacion: CONFIRMACION_PRODUCCION,
  });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /no es el de Producci/i);
});

test("sin saber cuál es el endpoint de Producción, no se escribe", () => {
  const decision = decidirEscrituraEnProduccion({
    host: PROD,
    hostProduccion: "",
    confirmacion: CONFIRMACION_PRODUCCION,
  });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /NEON_ENDPOINT_PRODUCCION/);
});

test("con el endpoint de Producción y la confirmación exacta, se permite", () => {
  assert.deepEqual(
    decidirEscrituraEnProduccion({
      host: PROD,
      hostProduccion: PROD,
      confirmacion: CONFIRMACION_PRODUCCION,
    }),
    { ok: true },
  );
});

test("el sufijo -pooler no confunde a la comprobación", () => {
  const conPooler = PROD.replace(".c-11", "-pooler.c-11");
  assert.equal(
    decidirEscrituraEnProduccion({
      host: conPooler,
      hostProduccion: PROD,
      confirmacion: CONFIRMACION_PRODUCCION,
    }).ok,
    true,
  );
});

test("el resumen cuenta productos afectados y fotografías conservadas", () => {
  const otra = "/catalogos/x/b.webp";
  const filas = [
    { ...base, id: "p-1", images: [base.image] },
    { ...base, id: "p-2", images: [base.image, otra] },
    { ...base, id: "p-3", images: null },
    { ...base, id: "p-4", images: [otra] },
  ];
  const resumen = resumirPlan(filas);
  assert.equal(resumen.afectados, 2);
  assert.equal(resumen.repeticionesQuitadas, 2);
  assert.equal(resumen.secundariasConservadas, 1);
  assert.equal(resumen.planes.length, 2);
});
