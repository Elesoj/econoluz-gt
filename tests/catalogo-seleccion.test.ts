import assert from "node:assert/strict";
import { test } from "node:test";

import { interpretarModelo } from "../app/lib/ajustes";
import {
  FASE_D_AUTORIZADA,
  interpretarAutorizacionFaseD,
  modeloEfectivo,
  servirSegunModelo,
} from "../app/data/catalogo/seleccion";

type Fallos = {
  alComparar?: () => Promise<void>;
  relacionalFalla?: boolean;
  legacyFalla?: boolean;
};

function fuentesEspia(fallos: Fallos = {}) {
  const llamadas: string[] = [];
  const registros: { nivel: string; suceso: string; datos: Record<string, unknown> }[] = [];
  return {
    llamadas,
    registros,
    fuentes: {
      legacy: async () => {
        llamadas.push("legacy");
        if (fallos.legacyFalla) throw new Error("legacy caido: password=secreta");
        return "catálogo-legacy";
      },
      relacional: async () => {
        llamadas.push("relacional");
        if (fallos.relacionalFalla) {
          throw new Error("relacional caido en ep-secreto.neon.tech");
        }
        return "catálogo-relacional";
      },
      comparar: async () => {
        llamadas.push("comparar");
        if (fallos.alComparar) await fallos.alComparar();
      },
      estatico: () => {
        llamadas.push("estatico");
        return "catálogo-estático";
      },
      registrar: (nivel: "info" | "error", suceso: string, datos = {}) => {
        registros.push({ nivel, suceso, datos });
      },
    },
  };
}

// --- La cadena de respaldo de relational_v2 -------------------------------------------
//
// Se prueba con la llave abierta a propósito: es la única forma de cubrir el camino que
// la Fase D usará. La constante `FASE_D_AUTORIZADA` sigue cerrada.

test("relational_v2 correcto sirve el catálogo relacional y no toca los demás", async () => {
  const { llamadas, registros, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("relational_v2", fuentes, true), "catálogo-relacional");
  assert.deepEqual(llamadas, ["relacional"]);
  assert.deepEqual(registros, []);
});

test("si el relacional falla, se sirve legacy y queda constancia", async () => {
  const { llamadas, registros, fuentes } = fuentesEspia({ relacionalFalla: true });
  assert.equal(await servirSegunModelo("relational_v2", fuentes, true), "catálogo-legacy");
  assert.deepEqual(llamadas, ["relacional", "legacy"]);

  const aviso = registros.find((r) => r.suceso === "catalogo-degradacion-relacional");
  assert.ok(aviso, "la degradación tiene que registrarse");
  assert.equal(aviso?.nivel, "error");
  assert.equal(registros.some((r) => r.suceso === "catalogo-degradacion-legacy"), false);
});

test("si fallan relacional y legacy, entra el catálogo estático", async () => {
  const { llamadas, registros, fuentes } = fuentesEspia({
    relacionalFalla: true,
    legacyFalla: true,
  });
  assert.equal(await servirSegunModelo("relational_v2", fuentes, true), "catálogo-estático");
  assert.deepEqual(llamadas, ["relacional", "legacy", "estatico"]);
  assert.equal(registros.filter((r) => r.suceso.startsWith("catalogo-degradacion")).length, 2);
});

test("el estático es el último recurso, nunca el primero", async () => {
  const { llamadas } = fuentesEspia();
  assert.equal(llamadas.includes("estatico"), false);

  const soloRelacionalFalla = fuentesEspia({ relacionalFalla: true });
  await servirSegunModelo("relational_v2", soloRelacionalFalla.fuentes, true);
  assert.equal(soloRelacionalFalla.llamadas.includes("estatico"), false);
});

test("las degradaciones no filtran el texto del error ni credenciales", async () => {
  const { registros, fuentes } = fuentesEspia({ relacionalFalla: true, legacyFalla: true });
  await servirSegunModelo("relational_v2", fuentes, true);
  const serializado = JSON.stringify(registros);
  assert.equal(serializado.includes("password"), false);
  assert.equal(serializado.includes("secreta"), false);
  assert.equal(serializado.includes("ep-secreto"), false);
  assert.equal(serializado.includes("neon.tech"), false);
});

test("legacy y shadow no usan la cadena de respaldo: su fallo sube a quien llama", async () => {
  for (const modelo of ["legacy", "shadow"] as const) {
    const { llamadas, fuentes } = fuentesEspia({ legacyFalla: true });
    await assert.rejects(() => servirSegunModelo(modelo, fuentes));
    assert.equal(llamadas.includes("estatico"), false, `${modelo} no debe caer al estático`);
  }
});

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
  const { llamadas, fuentes } = fuentesEspia({
    alComparar: async () => {
      throw new Error("la lectura relacional falló");
    },
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

// --- La autorización de la Fase D se parsea, no se adivina ---------------------------

test("solo la cadena exacta «true» autoriza la Fase D", () => {
  assert.equal(interpretarAutorizacionFaseD("true"), true);
});

test("ningún otro valor de entorno autoriza la Fase D", () => {
  const rechazados = [
    undefined,
    null,
    "",
    "false",
    "False",
    "TRUE",
    "True",
    " true",
    "true ",
    "1",
    "0",
    "si",
    "yes",
    "on",
    1,
    0,
    true,
    false,
    {},
    [],
    [1],
    "{}",
  ];
  for (const valor of rechazados) {
    assert.equal(
      interpretarAutorizacionFaseD(valor),
      false,
      `${JSON.stringify(valor)} no debe autorizar la Fase D`,
    );
  }
});

test("modeloEfectivo exige el booleano true, no cualquier valor verdadero", () => {
  const verdaderosQueNoSonTrue = [1, "true", "false", {}, [], [0], "0", -1, Infinity];
  for (const valor of verdaderosQueNoSonTrue) {
    assert.equal(
      modeloEfectivo("relational_v2", valor as unknown as boolean),
      "shadow",
      `${JSON.stringify(valor)} no debe activar relational_v2`,
    );
  }
  assert.equal(modeloEfectivo("relational_v2", true), "relational_v2");
});

test("servirSegunModelo tampoco se deja activar con un valor solo verdadero", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(
    await servirSegunModelo("relational_v2", fuentes, 1 as unknown as boolean),
    "catálogo-legacy",
  );
  assert.equal(llamadas.includes("relacional"), false);
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
