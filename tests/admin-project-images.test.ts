import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidProjectImageUrl,
  moveProjectImage,
  registerProjectImage,
  setProjectImageVisible,
} from "../app/admin/proyectos/imagenes";

type RecordQuery = {
  text: string;
  params: readonly (string | number | boolean | null)[];
};

function fakeQuery(responses: Record<string, unknown>[][], records: RecordQuery[] = []) {
  return async (text: string, params: readonly (string | number | boolean | null)[]) => {
    records.push({ text, params });
    return responses.shift() ?? [];
  };
}

test("solo acepta rutas de proyectos locales o del almacén público", () => {
  assert.equal(isValidProjectImageUrl("/proyectos/bmw/bmw1.jpeg"), true);
  assert.equal(isValidProjectImageUrl("/catalogos/x/y.webp"), false);
  assert.equal(
    isValidProjectImageUrl(
      "https://abc.public.blob.vercel-storage.com/proyectos/id/a.webp",
    ),
    true,
  );
  assert.equal(isValidProjectImageUrl("https://otro.example/foto.webp"), false);
});

test("registra al final y repetir la misma URL no crea un duplicado", async () => {
  const records: RecordQuery[] = [];
  await registerProjectImage(
    fakeQuery([[{ exists: true }], []], records),
    "bmw",
    "/proyectos/bmw/nueva.webp",
  );

  assert.equal(records.length, 2);
  assert.match(records[1].text, /coalesce\s*\(\s*max\s*\(position\)\s*,\s*0\s*\)\s*\+\s*10/i);
  assert.match(records[1].text, /on conflict\s*\(project_id, url\)\s*do nothing/i);
  assert.deepEqual(records[1].params, ["bmw", "/proyectos/bmw/nueva.webp"]);
});

test("rechaza una URL ajena antes de consultar", async () => {
  const records: RecordQuery[] = [];
  await assert.rejects(
    registerProjectImage(fakeQuery([], records), "bmw", "https://example.com/foto.jpg"),
    /ruta de la fotografía/i,
  );
  assert.equal(records.length, 0);
});

test("mueve una foto con un intercambio atómico limitado al proyecto", async () => {
  const records: RecordQuery[] = [];
  assert.deepEqual(
    await moveProjectImage(fakeQuery([[]], records), "bmw", 7, "up"),
    { ok: true },
  );

  assert.equal(records.length, 1);
  assert.match(records[0].text, /^\s*with current_image/i);
  assert.match(records[0].text, /project_id\s*=\s*\$1/g);
  assert.match(records[0].text, /position\s*</i);
  assert.match(records[0].text, /order by position desc/i);
  assert.match(records[0].text, /update project_images/i);
  assert.deepEqual(records[0].params, ["bmw", 7]);
});

test("mover hacia delante busca solo el vecino posterior del mismo proyecto", async () => {
  const records: RecordQuery[] = [];
  await moveProjectImage(fakeQuery([[]], records), "bmw", 7, "down");
  assert.match(records[0].text, /position\s*>/i);
  assert.match(records[0].text, /order by position asc/i);
  assert.match(records[0].text, /where project_id = \$1/i);
});

test("no oculta la última foto visible de un proyecto publicado", async () => {
  const records: RecordQuery[] = [];
  const result = await setProjectImageVisible(
    fakeQuery([[{ published: true, image_visible: true, visible_images: "1" }]], records),
    "bmw",
    7,
    false,
  );

  assert.deepEqual(result, {
    ok: false,
    error: "Un proyecto publicado necesita al menos una fotografía visible.",
  });
  assert.equal(records.length, 1);
});

test("puede ocultar una foto si el proyecto no está publicado", async () => {
  const records: RecordQuery[] = [];
  const result = await setProjectImageVisible(
    fakeQuery([[{ published: false, image_visible: true, visible_images: "1" }], []], records),
    "bmw",
    7,
    false,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(records.length, 2);
  assert.deepEqual(records[1].params, [false, "bmw", 7]);
});

test("volver a mostrar una foto no exige que haya otra visible", async () => {
  const records: RecordQuery[] = [];
  const result = await setProjectImageVisible(
    fakeQuery([[]], records),
    "bmw",
    7,
    true,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].params, [true, "bmw", 7]);
});

test("rechaza identificadores de imagen inválidos antes de consultar", async () => {
  const records: RecordQuery[] = [];
  assert.equal((await moveProjectImage(fakeQuery([], records), "bmw", Number.NaN, "up")).ok, false);
  assert.equal((await setProjectImageVisible(fakeQuery([], records), "bmw", 0, false)).ok, false);
  assert.equal(records.length, 0);
});

