import assert from "node:assert/strict";
import { test } from "node:test";
import { consultar } from "../app/lib/datos/consulta";
import { ErrorDeDatos } from "../app/lib/datos/errores";

test("devuelve las filas tal cual las da el ejecutor", async () => {
  const filas = await consultar(async () => [{ n: 1 }], "select 1");
  assert.deepEqual(filas, [{ n: 1 }]);
});

test("pasa los parámetros sin tocarlos", async () => {
  let recibidos: readonly unknown[] | undefined;
  await consultar(
    async (_texto, parametros) => {
      recibidos = parametros;
      return [];
    },
    "select $1",
    ["ECO-ELE-0001"],
  );
  assert.deepEqual(recibidos, ["ECO-ELE-0001"]);
});

test("un fallo del ejecutor sale como ErrorDeDatos, no como error crudo", async () => {
  await assert.rejects(
    () => consultar(async () => { throw new Error("socket colgado"); }, "select 1"),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "indisponible",
  );
});

test("una consulta que se pasa del tiempo máximo se corta", async () => {
  await assert.rejects(
    () =>
      consultar(
        () => new Promise((resolver) => setTimeout(() => resolver([]), 50)),
        "select pg_sleep(1)",
        [],
        { msMaximo: 10 },
      ),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "indisponible",
  );
});
