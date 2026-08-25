import assert from "node:assert/strict";
import { test } from "node:test";
import { readCatalogStats } from "../app/admin/panelStats";

test("convierte a números los conteos que Postgres devuelve como texto", async () => {
  const stats = await readCatalogStats(async () => [
    { total: "313", publicados: "312", con_precio: "0" },
  ]);
  assert.deepEqual(stats, { total: 313, publicados: 312, conPrecio: 0 });
});

test("una tabla vacía da ceros, no huecos", async () => {
  const stats = await readCatalogStats(async () => [
    { total: "0", publicados: "0", con_precio: "0" },
  ]);
  assert.deepEqual(stats, { total: 0, publicados: 0, conPrecio: 0 });
});

test("si la base de datos no responde, el panel no revienta", async () => {
  const stats = await readCatalogStats(async () => {
    throw new Error("Neon no disponible");
  });
  assert.equal(stats, null);
});

test("una respuesta inesperada se trata como falta de datos", async () => {
  assert.equal(await readCatalogStats(async () => []), null);
});
