import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  autorizarEscritura,
  comprobarConteo,
  decidirDestinoDeLectura,
  decidirEscrituraEnProduccion,
  decidirLecturaEnProduccion,
  decidirModo,
  decidirSiPuedeEscribir,
  exigirDestinoDeLectura,
  interpretarBandera,
} from "../scripts/guarda-neon.mjs";
import { ponerModelo, valorDeModeloAceptado } from "../scripts/modelo-catalogo.mjs";
import {
  marcadorEsperado,
  modeloAceptable,
} from "../scripts/verificar-catalogo-relacional.mjs";

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

// --- Lectura en Producción: un camino aparte, explícito y sin escritura ----------------
//
// La Fase D necesita comparar y verificar **contra Producción**, y eso el guardián de rama
// lo prohíbe por diseño. La salida no es relajarlo, sino un camino distinto que solo sirve
// para leer: exige pedirlo por su nombre y estar conectado justo al endpoint de Producción.

test("sin bandera, la lectura sigue siendo la de la rama de desarrollo", () => {
  assert.equal(decidirDestinoDeLectura([]), "desarrollo");
  assert.equal(decidirDestinoDeLectura(["--otra-cosa"]), "desarrollo");
});

test("leer Producción hay que pedirlo por su nombre", () => {
  assert.equal(decidirDestinoDeLectura(["--produccion"]), "produccion");
});

test("un argumento parecido no abre la lectura de Producción", () => {
  assert.equal(decidirDestinoDeLectura(["--produccion-no"]), "desarrollo");
});

test("leer Producción exige estar conectado a Producción", () => {
  const decision = decidirLecturaEnProduccion({
    host: DESARROLLO,
    hostProduccion: PRODUCCION,
  });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /no es el de Producci[oó]n/);
});

test("sin saber cuál es el endpoint de Producción, tampoco se lee", () => {
  const decision = decidirLecturaEnProduccion({ host: PRODUCCION, hostProduccion: "" });

  assert.equal(decision.ok, false);
  assert.match(decision.motivo ?? "", /NEON_ENDPOINT_PRODUCCION/);
});

test("conectado a Producción y pidiéndolo, se puede leer", () => {
  const decision = decidirLecturaEnProduccion({
    host: `${PRODUCCION.replace(".c-11", "-pooler.c-11")}`,
    hostProduccion: PRODUCCION,
  });

  assert.equal(decision.ok, true);
});

test("el destino «desarrollo» sigue leyendo el marcador de rama", async () => {
  const { cliente, consultas } = clienteFalso();
  await exigirDestinoDeLectura(cliente, ENTORNO_DESARROLLO, "desarrollo");
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /app_settings/);
});

test("el destino «produccion» no consulta el marcador, que allí no existe", async () => {
  const { cliente, consultas } = clienteFalso();
  await exigirDestinoDeLectura(
    cliente,
    entornoFalso({
      DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
      NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    }),
    "produccion",
  );
  assert.deepEqual(consultas, []);
});

test("el destino «produccion» se niega si la conexión es la de desarrollo", async () => {
  const { cliente } = clienteFalso();
  await assert.rejects(
    () => exigirDestinoDeLectura(cliente, ENTORNO_DESARROLLO, "produccion"),
    /no es el de Producci[oó]n/,
  );
});

// --- La bandera del modelo: `relational_v2` y su camino a Producción -------------------

test("el modelo relacional ya es un valor aceptable, y la basura no", () => {
  assert.equal(valorDeModeloAceptado("legacy"), true);
  assert.equal(valorDeModeloAceptado("shadow"), true);
  assert.equal(valorDeModeloAceptado("relational_v2"), true);
  assert.equal(valorDeModeloAceptado("relacional"), false);
  assert.equal(valorDeModeloAceptado(""), false);
  assert.equal(valorDeModeloAceptado(undefined), false);
});

test("cambiar el modelo en Producción exige las tres llaves", async () => {
  const { cliente } = clienteFalso();
  await assert.rejects(
    () =>
      ponerModelo(cliente, "relational_v2", entornoFalso({
        DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
        PERMITIR_ESCRITURA_PRODUCCION: "true",
      }), "produccion"),
    /confirmaci[oó]n literal/,
  );
});

test("con las tres llaves, el modelo se escribe en Producción", async () => {
  const { cliente, consultas } = clienteFalso("relational_v2");
  const valor = await ponerModelo(cliente, "relational_v2", entornoFalso({
    DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    PERMITIR_ESCRITURA_PRODUCCION: "true",
    CONFIRMAR_PRODUCCION: "modelo-catalogo-en-produccion",
  }), "produccion");

  assert.equal(valor, "relational_v2");
  assert.ok(consultas.some((sql) => /update app_settings/.test(sql)), "debe actualizar");
  assert.ok(consultas.includes("commit"), "debe confirmar la transacción");
});

test("la vuelta a legacy es el mismo camino, y por eso está siempre disponible", async () => {
  const { cliente, consultas } = clienteFalso("legacy");
  const valor = await ponerModelo(cliente, "legacy", entornoFalso({
    DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    PERMITIR_ESCRITURA_PRODUCCION: "true",
    CONFIRMAR_PRODUCCION: "modelo-catalogo-en-produccion",
  }), "produccion");

  assert.equal(valor, "legacy");
  assert.ok(consultas.includes("commit"));
});

// --- Que los caminos de Producción de la Fase D no se pierdan sin avisar ---------------

test("los scripts de la Fase D conservan su autorización de Producción", () => {
  const guardados = [
    ["scripts/importar-catalogo-relacional.mjs", "importar-relacional-en-produccion"],
    ["scripts/modelo-catalogo.mjs", "modelo-catalogo-en-produccion"],
  ] as const;

  for (const [ruta, confirmacion] of guardados) {
    const fuente = readFileSync(ruta, "utf8");
    assert.match(fuente, /from "\.\/guarda-neon\.mjs"/, `${ruta} debe usar el guardián`);
    assert.match(fuente, /autorizarEscritura/, `${ruta} debe autorizar antes de escribir`);
    assert.ok(fuente.includes(confirmacion), `${ruta} debe exigir «${confirmacion}»`);
    assert.match(fuente, /rollback/, `${ruta} debe poder revertir`);
  }

  const soloLectura = [
    "scripts/comparar-catalogo-shadow.mjs",
    "scripts/verificar-catalogo-relacional.mjs",
  ];
  for (const ruta of soloLectura) {
    const fuente = readFileSync(ruta, "utf8");
    assert.match(fuente, /exigirDestinoDeLectura/, `${ruta} debe exigir destino de lectura`);
    assert.ok(
      !fuente.includes("autorizarEscritura"),
      `${ruta} solo lee: no debe pedir autorización de escritura`,
    );
  }
});

// --- Lo que el verificador debe esperar en cada destino --------------------------------
//
// Dos comprobaciones del verificador solo tenían sentido en la rama de desarrollo: exigir
// el marcador de rama —que Producción no tiene ni debe tener— y prohibir `relational_v2`,
// que en la Fase D es precisamente el estado bueno. Ninguna de las dos se elimina: se
// vuelven dependientes del destino, para que sigan mordiendo donde tenían sentido.

test("en desarrollo se sigue exigiendo el marcador de la rama aislada", () => {
  assert.equal(marcadorEsperado("desarrollo", "catalogo-relacional-fase-b"), "catalogo-relacional-fase-b");
});

test("en Producción el marcador correcto es no tener ninguno", () => {
  assert.equal(marcadorEsperado("produccion", "catalogo-relacional-fase-b"), null);
});

test("en desarrollo, `relational_v2` sigue prohibido", () => {
  assert.equal(modeloAceptable("legacy", "desarrollo"), true);
  assert.equal(modeloAceptable("shadow", "desarrollo"), true);
  assert.equal(modeloAceptable("relational_v2", "desarrollo"), false);
});

test("en Producción, `relational_v2` es un estado válido desde la Fase D", () => {
  assert.equal(modeloAceptable("legacy", "produccion"), true);
  assert.equal(modeloAceptable("shadow", "produccion"), true);
  assert.equal(modeloAceptable("relational_v2", "produccion"), true);
});

test("ningún destino acepta un valor inventado", () => {
  assert.equal(modeloAceptable("relacional", "produccion"), false);
  assert.equal(modeloAceptable(null, "desarrollo"), false);
});
