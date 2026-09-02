import assert from "node:assert/strict";
import { test } from "node:test";

import { interpretarModelo } from "../app/lib/ajustes";
import {
  FASE_D_AUTORIZADA,
  modeloEfectivo,
  servirSegunModelo,
} from "../app/data/catalogo/seleccion";

function fuentesEspia(alComparar?: () => Promise<void>) {
  const llamadas: string[] = [];
  return {
    llamadas,
    fuentes: {
      legacy: async () => {
        llamadas.push("legacy");
        return "catálogo-legacy";
      },
      relacional: async () => {
        llamadas.push("relacional");
        return "catálogo-relacional";
      },
      comparar: async () => {
        llamadas.push("comparar");
        if (alComparar) await alComparar();
      },
    },
  };
}

test("legacy no consulta el modelo relacional ni compara", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("legacy", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy"]);
});

test("shadow ejecuta ambos caminos pero devuelve exactamente legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("shadow", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy", "comparar"]);
});

test("un fallo de la comparación no rompe la respuesta legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia(async () => {
    throw new Error("la lectura relacional falló");
  });
  assert.equal(await servirSegunModelo("shadow", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy", "comparar"]);
});

test("mientras la Fase D no esté autorizada, relational_v2 sirve legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("relational_v2", fuentes, false), "catálogo-legacy");
  assert.equal(llamadas.includes("relacional"), false);
});

test("con la Fase D autorizada, relational_v2 sirve el catálogo relacional", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("relational_v2", fuentes, true), "catálogo-relacional");
  assert.deepEqual(llamadas, ["relacional"]);
});

test("la llave de la Fase D está cerrada en la Fase C", () => {
  assert.equal(FASE_D_AUTORIZADA, false);
  assert.equal(modeloEfectivo("relational_v2"), "shadow");
  assert.equal(modeloEfectivo("shadow"), "shadow");
  assert.equal(modeloEfectivo("legacy"), "legacy");
});

test("relational_v2 no se activa con ningún valor que no sea exactamente ese", () => {
  for (const valor of [
    "relational_v2 ",
    " relational_v2",
    "RELATIONAL_V2",
    "relacional_v2",
    "v2",
    "",
    null,
    undefined,
    1,
    true,
    {},
  ]) {
    assert.equal(interpretarModelo(valor), "legacy", `${String(valor)} no debe activar nada`);
  }
  assert.equal(interpretarModelo("relational_v2"), "relational_v2");
});
