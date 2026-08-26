import assert from "node:assert/strict";
import { test } from "node:test";
import { projects, toPublicProject } from "../app/data/projects";
import { fromProjectRows, projectRowsToPublic, toProjectRows } from "../app/data/projectRow";

const TITULOS = [
  "Borghetto",
  "Agencia BMW",
  "Torre Once",
  "San Martin",
  "Insigne",
  "Casa Campo",
  "La Estación",
  "Quo",
  "Veka",
  "Desigual",
  "Geely",
  "Perfiles LED",
];

const IDENTIFICADORES = [
  "borghetto",
  "agencia-bmw",
  "torre-once",
  "san-martin",
  "insigne",
  "casa-campo",
  "la-estacion",
  "quo",
  "veka",
  "desigual",
  "geely",
  "perfiles-led",
];

test("los proyectos conservan un identificador estable independiente del título", () => {
  assert.deepEqual(
    projects.map((project) => (project as { id?: string }).id),
    IDENTIFICADORES,
  );
});

test("el inventario público sigue teniendo doce proyectos y 104 fotografías", () => {
  assert.deepEqual(projects.map(({ title }) => title), TITULOS);
  assert.equal(projects.flatMap(({ images }) => images).length, 104);
});

test("el viaje por filas conserva exactamente el contenido y el orden", () => {
  const rows = toProjectRows(projects);
  const rebuilt = fromProjectRows(rows.projects, rows.images);

  assert.deepEqual(rebuilt.map(toPublicProject), projects.map(toPublicProject));
  assert.deepEqual(
    rows.projects.map(({ position }) => position),
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
  );
  assert.equal(rows.images.length, 104);
  assert.equal(rows.images.every(({ visible }) => visible), true);
});

test("el contrato público reconstruido no contiene el identificador interno", () => {
  const rows = toProjectRows(projects);
  const publicProjects = projectRowsToPublic(rows.projects, rows.images);

  assert.equal(publicProjects.length, 12);
  assert.equal(publicProjects.some((project) => "id" in project), false);
});

test("ocultar una fotografía la retira sin perder su fila", () => {
  const rows = toProjectRows(projects);
  rows.images[0].visible = false;

  const rebuilt = fromProjectRows(rows.projects, rows.images);
  assert.equal(rows.images.length, 104);
  assert.deepEqual(rebuilt[0].images, projects[0].images.slice(1));
});
