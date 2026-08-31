import assert from "node:assert/strict";
import { test } from "node:test";
import { enTransaccion } from "../app/lib/datos/transaccion";
import { ErrorDeDatos } from "../app/lib/datos/errores";

/** Pool de mentira que apunta todo lo que se le pide. */
function poolDePrueba(alConsultar?: (texto: string) => void) {
  const estado = { prestados: 0, liberados: 0, sentencias: [] as string[] };
  const pool = {
    async connect() {
      estado.prestados += 1;
      return {
        async query(texto: string) {
          estado.sentencias.push(texto);
          alConsultar?.(texto);
          return { rows: [] };
        },
        release() {
          estado.liberados += 1;
        },
      };
    },
  };
  return { pool, estado };
}

test("una transacción correcta abre, trabaja y confirma", async () => {
  const { pool, estado } = poolDePrueba();
  const resultado = await enTransaccion(pool, async (ejecutar) => {
    await ejecutar("insert into t values (1)");
    return "listo";
  });
  assert.equal(resultado, "listo");
  assert.deepEqual(estado.sentencias.filter((s) => s === "begin" || s === "commit"), [
    "begin",
    "commit",
  ]);
});

test("si el trabajo falla se deshace y no se confirma", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(
    () => enTransaccion(pool, async () => { throw new Error("algo se rompió"); }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
  assert.ok(estado.sentencias.includes("rollback"));
  assert.ok(!estado.sentencias.includes("commit"));
});

test("el cliente se libera siempre, también cuando falla", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  assert.equal(estado.prestados, 1);
  assert.equal(estado.liberados, 1);
});

test("tras una transacción fallida se puede hacer otra correcta", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  const resultado = await enTransaccion(pool, async () => 42);
  assert.equal(resultado, 42);
  assert.equal(estado.prestados, estado.liberados);
});

test("fija un tiempo máximo dentro de la transacción", async () => {
  const { pool, estado } = poolDePrueba();
  await enTransaccion(pool, async () => null, { msMaximo: 3000 });
  assert.ok(estado.sentencias.some((s) => s.includes("set local statement_timeout")));
});
