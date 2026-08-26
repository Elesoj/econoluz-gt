import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProject,
  moveProject,
  readAdminProject,
  readAdminProjects,
  saveProject,
  setProjectPublished,
  validateProjectInput,
} from "../app/admin/proyectos/model";

type QueryRecord = {
  text: string;
  params: readonly (string | number | boolean | null)[];
};

function fakeQuery(responses: Record<string, unknown>[][], records: QueryRecord[] = []) {
  return async (text: string, params: readonly (string | number | boolean | null)[]) => {
    records.push({ text, params });
    return responses.shift() ?? [];
  };
}

test("limpia los tres textos de un proyecto válido", () => {
  assert.deepEqual(
    validateProjectInput({
      title: "  Proyecto nuevo ",
      type: "  Hotel ",
      description: "  Luz arquitectónica. ",
    }),
    {
      ok: true,
      data: { title: "Proyecto nuevo", type: "Hotel", description: "Luz arquitectónica." },
    },
  );
});

test("explica qué campo obligatorio está vacío", () => {
  assert.deepEqual(validateProjectInput({ title: " ", type: "Hotel", description: "Luz" }), {
    ok: false,
    error: "Escribe el título del proyecto.",
  });
  assert.equal(validateProjectInput({ title: "Uno", type: " ", description: "Luz" }).ok, false);
  assert.equal(validateProjectInput({ title: "Uno", type: "Hotel", description: " " }).ok, false);
});

test("convierte posiciones y conteos de Postgres a números", async () => {
  const projects = await readAdminProjects(
    fakeQuery([
      [
        {
          id: "hotel-uno",
          position: "20",
          title: "Hotel Uno",
          type: "Hotel",
          description: "Luz",
          published: true,
          visible_images: "3",
          total_images: "4",
        },
      ],
    ]),
  );

  assert.deepEqual(projects[0], {
    id: "hotel-uno",
    position: 20,
    title: "Hotel Uno",
    type: "Hotel",
    description: "Luz",
    published: true,
    visibleImages: 3,
    totalImages: 4,
  });
});

test("crea al final, oculto y con el identificador recibido", async () => {
  const records: QueryRecord[] = [];
  const id = await createProject(
    fakeQuery([[{ id: "proyecto-nuevo" }]], records),
    "proyecto-nuevo",
    { title: "Proyecto", type: "Hotel", description: "Descripción" },
  );

  assert.equal(id, "proyecto-nuevo");
  assert.match(records[0].text, /coalesce\s*\(\s*max\s*\(position\)\s*,\s*0\s*\)\s*\+\s*10/i);
  assert.match(records[0].text, /published/i);
  assert.deepEqual(records[0].params, ["proyecto-nuevo", "Proyecto", "Hotel", "Descripción"]);
});

test("los textos editados viajan como parámetros y nunca dentro del SQL", async () => {
  const records: QueryRecord[] = [];
  const dangerous = "Hotel'); drop table projects; --";
  await saveProject(fakeQuery([[]], records), "hotel-uno", {
    title: dangerous,
    type: "Hotel",
    description: "Descripción",
  });

  assert.equal(records[0].text.includes(dangerous), false);
  assert.deepEqual(records[0].params, [dangerous, "Hotel", "Descripción", "hotel-uno"]);
});

test("rechaza publicar cuando no hay fotografías visibles", async () => {
  const records: QueryRecord[] = [];
  const result = await setProjectPublished(
    fakeQuery([[{ visible_images: "0" }]], records),
    "hotel-uno",
    true,
  );

  assert.deepEqual(result, {
    ok: false,
    error: "Añade al menos una fotografía visible antes de publicar.",
  });
  assert.equal(records.length, 1);
});

test("publica después de comprobar que existe una fotografía visible", async () => {
  const records: QueryRecord[] = [];
  const result = await setProjectPublished(
    fakeQuery([[{ visible_images: "1" }], []], records),
    "hotel-uno",
    true,
  );

  assert.deepEqual(result, { ok: true });
  assert.match(records[1].text, /update projects/i);
  assert.deepEqual(records[1].params, [true, "hotel-uno"]);
});

test("ocultar no necesita consultar las fotografías", async () => {
  const records: QueryRecord[] = [];
  assert.deepEqual(
    await setProjectPublished(fakeQuery([[]], records), "hotel-uno", false),
    { ok: true },
  );
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].params, [false, "hotel-uno"]);
});

test("mueve hacia arriba con un único intercambio atómico", async () => {
  const records: QueryRecord[] = [];
  await moveProject(fakeQuery([[]], records), "hotel-uno", "up");

  assert.equal(records.length, 1);
  assert.match(records[0].text, /^\s*with current_project/i);
  assert.match(records[0].text, /position\s*</i);
  assert.match(records[0].text, /order by position desc/i);
  assert.match(records[0].text, /update projects/i);
  assert.match(records[0].text, /case/i);
  assert.deepEqual(records[0].params, ["hotel-uno"]);
});

test("mueve hacia abajo buscando el vecino posterior", async () => {
  const records: QueryRecord[] = [];
  await moveProject(fakeQuery([[]], records), "hotel-uno", "down");

  assert.equal(records.length, 1);
  assert.match(records[0].text, /position\s*>/i);
  assert.match(records[0].text, /order by position asc/i);
});

test("un identificador inexistente devuelve null", async () => {
  const records: QueryRecord[] = [];
  const project = await readAdminProject(fakeQuery([[]], records), "no-existe");
  assert.equal(project, null);
  assert.equal(records.length, 1);
});

