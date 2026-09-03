import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  autorizarEscritura,
  comprobarConteo,
  decidirEscrituraEnProduccion,
  decidirModo,
  decidirSiPuedeEscribir,
  interpretarBandera,
} from "../scripts/guarda-neon.mjs";

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

// --- El modo de ejecución: simular salvo que se pida escribir -------------------------

test("sin argumentos se simula, que es lo que no toca nada", () => {
  assert.equal(decidirModo([]), "simular");
  assert.equal(decidirModo(["--simular"]), "simular");
  assert.equal(decidirModo(["--loquesea"]), "simular");
});

test("escribir exige pedirlo por su nombre", () => {
  assert.equal(decidirModo(["--aplicar"]), "aplicar");
  assert.equal(decidirModo(["--aplicar-produccion"]), "aplicar-produccion");
});

test("un argumento parecido no se confunde con el de escribir", () => {
  for (const argumento of ["--aplicar-todo", "aplicar", "--APLICAR", "--aplicar=1"]) {
    assert.equal(decidirModo([argumento]), "simular", `${argumento} no debe escribir`);
  }
});

// --- La bandera se parsea, no se adivina ---------------------------------------------

test("solo la cadena exacta «true» levanta una bandera", () => {
  assert.equal(interpretarBandera("true"), true);
  for (const valor of [undefined, null, "", "false", "True", "TRUE", "1", 1, true, {}, []]) {
    assert.equal(interpretarBandera(valor), false, `${JSON.stringify(valor)} no vale`);
  }
});

// --- Escribir en Producción exige tres cosas a la vez ---------------------------------

const PRODUCCION_OK = {
  host: PRODUCCION,
  hostProduccion: PRODUCCION,
  confirmacion: "reproyectar-en-produccion",
  esperada: "reproyectar-en-produccion",
  bandera: true,
};

test("con endpoint, bandera y confirmación correctos, se permite", () => {
  assert.deepEqual(decidirEscrituraEnProduccion(PRODUCCION_OK), { ok: true });
});

test("sin la bandera explícita no se escribe en Producción", () => {
  const decision = decidirEscrituraEnProduccion({ ...PRODUCCION_OK, bandera: false });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /bandera/i);
});

test("sin la confirmación literal no se escribe en Producción", () => {
  for (const confirmacion of [undefined, "", "si", "REPROYECTAR-EN-PRODUCCION"]) {
    const decision = decidirEscrituraEnProduccion({ ...PRODUCCION_OK, confirmacion });
    assert.equal(decision.ok, false, `${confirmacion} no debería valer`);
    assert.match(String(decision.motivo), /confirmaci/i);
  }
});

test("este camino no puede tocar la rama de desarrollo por equivocación", () => {
  const decision = decidirEscrituraEnProduccion({ ...PRODUCCION_OK, host: DESARROLLO });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /no es el de Producci/i);
});

test("sin saber cuál es el endpoint de Producción, no se escribe", () => {
  const decision = decidirEscrituraEnProduccion({ ...PRODUCCION_OK, hostProduccion: "" });
  assert.equal(decision.ok, false);
  assert.match(String(decision.motivo), /NEON_ENDPOINT_PRODUCCION/);
});

test("el sufijo -pooler no confunde a la comprobación", () => {
  const conPooler = PRODUCCION.replace(".c-11", "-pooler.c-11");
  assert.equal(decidirEscrituraEnProduccion({ ...PRODUCCION_OK, host: conPooler }).ok, true);
});

// --- El conteo esperado ---------------------------------------------------------------

test("un conteo distinto del esperado no se da por bueno", () => {
  assert.equal(comprobarConteo({ esperado: 313, obtenido: 313, etiqueta: "productos" }).ok, true);
  const corto = comprobarConteo({ esperado: 313, obtenido: 312, etiqueta: "productos" });
  assert.equal(corto.ok, false);
  assert.match(String(corto.motivo), /313/);
  assert.match(String(corto.motivo), /312/);
});

test("un conteo que no es un número entero se rechaza", () => {
  for (const obtenido of [null, undefined, NaN, "313", 313.5]) {
    assert.equal(
      comprobarConteo({ esperado: 313, obtenido, etiqueta: "productos" }).ok,
      false,
      `${String(obtenido)} no es un conteo`,
    );
  }
});

// --- El despachador: qué guardián se aplica en cada modo -------------------------------
//
// Se prueba con un cliente falso. Ninguna de estas pruebas abre una conexión.

/** Un entorno de mentira. `ProcessEnv` exige NODE_ENV y aquí no pinta nada. */
const entornoFalso = (valores: Record<string, string>) =>
  valores as unknown as NodeJS.ProcessEnv;

function clienteFalso(valorDeRama = "catalogo-relacional-fase-b") {
  const consultas: string[] = [];
  return {
    consultas,
    cliente: {
      query: async (texto: string) => {
        consultas.push(texto);
        return { rows: [{ valor: valorDeRama }], rowCount: 1 };
      },
    },
  };
}

const ENTORNO_DESARROLLO = entornoFalso({
  DATABASE_URL: `postgresql://u:p@${DESARROLLO}/neondb`,
  NEON_ENDPOINT_ESPERADO: DESARROLLO,
  NEON_ENDPOINT_PRODUCCION: PRODUCCION,
  NEON_RAMA_ESPERADA: "catalogo-relacional-fase-b",
});

test("simular no consulta la base ni autoriza escritura", async () => {
  const { cliente, consultas } = clienteFalso();
  const decision = await autorizarEscritura(cliente, {
    modo: "simular",
    entorno: ENTORNO_DESARROLLO,
    confirmacionEsperada: "da-igual",
  });
  assert.deepEqual(decision, { escribe: false, destino: "simulacion" });
  assert.deepEqual(consultas, [], "simular no debe consultar nada");
});

test("aplicar pasa por el guardián de rama de desarrollo", async () => {
  const { cliente, consultas } = clienteFalso();
  const decision = await autorizarEscritura(cliente, {
    modo: "aplicar",
    entorno: ENTORNO_DESARROLLO,
    confirmacionEsperada: "da-igual",
  });
  assert.deepEqual(decision, { escribe: true, destino: "desarrollo" });
  assert.equal(consultas.length, 1, "tiene que haber leído el marcador de rama");
  assert.match(consultas[0], /app_settings/);
});

test("aplicar se niega si la base dice ser otra rama", async () => {
  const { cliente } = clienteFalso("otra-rama-cualquiera");
  await assert.rejects(
    () =>
      autorizarEscritura(cliente, {
        modo: "aplicar",
        entorno: ENTORNO_DESARROLLO,
        confirmacionEsperada: "da-igual",
      }),
    /otra-rama-cualquiera/,
  );
});

test("aplicar-produccion se niega sin las tres llaves", async () => {
  const entornoProduccion = {
    DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
  } as Record<string, string>;
  const casos = [
    ["sin nada", {}],
    ["solo la bandera", { PERMITIR_ESCRITURA_PRODUCCION: "true" }],
    ["solo la confirmación", { CONFIRMAR_PRODUCCION: "importar-en-produccion" }],
    ["bandera que no es «true»", {
      PERMITIR_ESCRITURA_PRODUCCION: "1",
      CONFIRMAR_PRODUCCION: "importar-en-produccion",
    }],
  ] as const;

  for (const [nombre, extra] of casos) {
    const { cliente } = clienteFalso();
    await assert.rejects(
      () =>
        autorizarEscritura(cliente, {
          modo: "aplicar-produccion",
          entorno: entornoFalso({ ...entornoProduccion, ...extra }),
          confirmacionEsperada: "importar-en-produccion",
        }),
      (error: Error) => error instanceof Error,
      `«${nombre}» no debería autorizar`,
    );
  }
});

test("aplicar-produccion con las tres llaves autoriza y no mira el marcador de rama", async () => {
  const { cliente, consultas } = clienteFalso();
  const decision = await autorizarEscritura(cliente, {
    modo: "aplicar-produccion",
    entorno: entornoFalso({
      DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
      NEON_ENDPOINT_PRODUCCION: PRODUCCION,
      PERMITIR_ESCRITURA_PRODUCCION: "true",
      CONFIRMAR_PRODUCCION: "importar-en-produccion",
    }),
    confirmacionEsperada: "importar-en-produccion",
  });
  assert.deepEqual(decision, { escribe: true, destino: "produccion" });
  assert.deepEqual(consultas, [], "Producción no tiene marcador de rama que leer");
});

test("aplicar-produccion no puede escribir en desarrollo aunque estén las llaves", async () => {
  const { cliente } = clienteFalso();
  await assert.rejects(
    () =>
      autorizarEscritura(cliente, {
        modo: "aplicar-produccion",
        entorno: entornoFalso({
          DATABASE_URL: `postgresql://u:p@${DESARROLLO}/neondb`,
          NEON_ENDPOINT_PRODUCCION: PRODUCCION,
          PERMITIR_ESCRITURA_PRODUCCION: "true",
          CONFIRMAR_PRODUCCION: "importar-en-produccion",
        }),
        confirmacionEsperada: "importar-en-produccion",
      }),
    /no es el de Producción/,
  );
});

// --- Que nadie vuelva a dejar estos scripts sin guardián -------------------------------

test("los scripts que reescriben el catálogo entero siguen protegidos", () => {
  const guardados = [
    ["scripts/import-products.mjs", "importar-en-produccion"],
    ["scripts/reproyectar-catalogo.mjs", "reproyectar-en-produccion"],
  ] as const;

  for (const [ruta, confirmacion] of guardados) {
    const fuente = readFileSync(ruta, "utf8");
    assert.match(fuente, /from "\.\/guarda-neon\.mjs"/, `${ruta} debe usar el guardián`);
    assert.match(fuente, /autorizarEscritura/, `${ruta} debe autorizar antes de escribir`);
    assert.match(fuente, /comprobarConteo/, `${ruta} debe comprobar el conteo`);
    assert.ok(fuente.includes(confirmacion), `${ruta} debe exigir «${confirmacion}»`);
    assert.match(fuente, /rollback/, `${ruta} debe poder revertir`);
    assert.match(fuente, /"begin"/, `${ruta} debe escribir en transacción`);
  }
});
