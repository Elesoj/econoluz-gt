import assert from "node:assert/strict";
import { test } from "node:test";
import { readPublicProjects, resolvePublicProjects } from "../app/data/projectsQuery";

type QueryRecord = {
  text: string;
  params: readonly (string | number | boolean | null)[];
};

test("agrupa proyectos y fotografías en el orden público", async () => {
  const queries: QueryRecord[] = [];
  const result = await readPublicProjects(async (text, params) => {
    queries.push({ text, params });
    return [
      {
        project_id: "bmw",
        project_position: "20",
        title: "BMW",
        type: "Automotriz",
        description: "B",
        image_url: "/proyectos/bmw/2.jpg",
        image_position: "20",
      },
      {
        project_id: "uno",
        project_position: "10",
        title: "Uno",
        type: "Edificio",
        description: "A",
        image_url: "/proyectos/uno/1.jpg",
        image_position: "10",
      },
      {
        project_id: "bmw",
        project_position: "20",
        title: "BMW",
        type: "Automotriz",
        description: "B",
        image_url: "/proyectos/bmw/1.jpg",
        image_position: "10",
      },
    ];
  });

  assert.deepEqual(result, [
    {
      title: "Uno",
      type: "Edificio",
      description: "A",
      images: ["/proyectos/uno/1.jpg"],
    },
    {
      title: "BMW",
      type: "Automotriz",
      description: "B",
      images: ["/proyectos/bmw/1.jpg", "/proyectos/bmw/2.jpg"],
    },
  ]);
  assert.equal(result.some((project) => "id" in project), false);
  assert.match(queries[0].text, /p\.published/);
  assert.match(queries[0].text, /i\.visible/);
  assert.deepEqual(queries[0].params, []);
});

test("una consulta sin filas devuelve una lista vacía", async () => {
  assert.deepEqual(await readPublicProjects(async () => []), []);
});

const FALLBACK = [
  { title: "Respaldo", type: "Edificio", description: "Local", images: ["/proyectos/x.jpg"] },
];

test("una respuesta vacía de Neon usa el respaldo", async () => {
  assert.deepEqual(await resolvePublicProjects(async () => [], () => FALLBACK), FALLBACK);
});

test("un fallo de Neon usa el respaldo y conserva el error para el registro", async () => {
  const errors: unknown[] = [];
  const result = await resolvePublicProjects(
    async () => {
      throw new Error("Neon no responde");
    },
    () => FALLBACK,
    (error) => errors.push(error),
  );

  assert.deepEqual(result, FALLBACK);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /Neon no responde/);
});

test("una lectura válida de Neon no se sustituye por el respaldo", async () => {
  const stored = [
    { title: "Neon", type: "Retail", description: "Guardado", images: ["/proyectos/y.jpg"] },
  ];
  assert.deepEqual(await resolvePublicProjects(async () => stored, () => FALLBACK), stored);
});
