import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretarModelo, leerModeloDeCatalogo } from "../app/lib/ajustes";

test("acepta los tres valores previstos", () => {
  assert.equal(interpretarModelo("legacy"), "legacy");
  assert.equal(interpretarModelo("shadow"), "shadow");
  assert.equal(interpretarModelo("relational_v2"), "relational_v2");
});

test("cualquier otra cosa cae en legacy, que es lo seguro", () => {
  assert.equal(interpretarModelo("v3"), "legacy");
  assert.equal(interpretarModelo(null), "legacy");
  assert.equal(interpretarModelo(undefined), "legacy");
  assert.equal(interpretarModelo(""), "legacy");
  assert.equal(interpretarModelo(" legacy "), "legacy");
  assert.equal(interpretarModelo(3), "legacy");
});

test("si la base no responde, se sirve legacy y no se rompe nada", async () => {
  const modelo = await leerModeloDeCatalogo(async () => {
    throw new Error("Neon no disponible");
  });
  assert.equal(modelo, "legacy");
});

test("lee el valor guardado", async () => {
  const modelo = await leerModeloDeCatalogo(async () => [{ valor: "shadow" }]);
  assert.equal(modelo, "shadow");
});

test("una tabla vacía o sin la fila tampoco rompe: legacy", async () => {
  assert.equal(await leerModeloDeCatalogo(async () => []), "legacy");
});

// Si alguien renombra la clave en la migración y no aquí, la lectura devolvería
// `legacy` para siempre sin que ninguna prueba se quejara. Esta lo detecta.
test("pregunta por la clave modelo_catalogo, con parámetro y no interpolada", async () => {
  let textoVisto = "";
  let parametrosVistos: readonly unknown[] | undefined;

  await leerModeloDeCatalogo(async (texto, parametros) => {
    textoVisto = texto;
    parametrosVistos = parametros;
    return [];
  });

  assert.deepEqual(parametrosVistos, ["modelo_catalogo"]);
  assert.match(textoVisto, /from app_settings/);
  assert.equal(textoVisto.includes("'modelo_catalogo'"), false);
});
