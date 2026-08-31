import assert from "node:assert/strict";
import { test } from "node:test";
import { consultar, MS_MAXIMO_POR_DEFECTO } from "../app/lib/datos/consulta";
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

test("una consulta que se pasa del tiempo máximo deja de esperarse", async () => {
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

test("msMaximo: 0 no desactiva el límite; usa el valor por defecto", async () => {
  // Antes del arreglo, `?? MS_MAXIMO_POR_DEFECTO` dejaba pasar el 0 tal cual
  // porque `??` solo cubre `null`/`undefined`, y un plazo de 0 ms rechaza la
  // consulta al instante. Una espera de 20 ms debe resolverse sin problema si
  // de verdad se está aplicando el valor por defecto (10 s).
  const filas = await consultar(
    () => new Promise((resolver) => setTimeout(() => resolver([{ ok: true }]), 20)),
    "select 1",
    [],
    { msMaximo: 0 },
  );
  assert.deepEqual(filas, [{ ok: true }]);
});

test("msMaximo inválido (NaN, negativo o infinito) también usa el valor por defecto", async () => {
  for (const invalido of [Number.NaN, -100, Number.POSITIVE_INFINITY]) {
    const filas = await consultar(async () => [{ n: 1 }], "select 1", [], {
      msMaximo: invalido,
    });
    assert.deepEqual(filas, [{ n: 1 }]);
  }
});

test("un msMaximo válido y explícito sigue respetándose", () => {
  // No es una prueba de comportamiento asíncrono (ya la cubre el test de
  // arriba), sino una constatación de que el valor por defecto documentado
  // sigue siendo 10 segundos.
  assert.equal(MS_MAXIMO_POR_DEFECTO, 10_000);
});
