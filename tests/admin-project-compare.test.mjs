import assert from "node:assert/strict";
import { test } from "node:test";
import { projects } from "../app/data/projects.ts";
import { compareProjects, formatProjectProblems } from "../scripts/compare-projects.mjs";

test("una reconstrucción idéntica no produce diferencias", () => {
  assert.deepEqual(compareProjects(projects, structuredClone(projects)), []);
});

test("un título cambiado identifica el proyecto y el campo", () => {
  const rebuilt = structuredClone(projects);
  rebuilt[1].title = "BMW cambiado";

  const problems = compareProjects(projects, rebuilt);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /agencia-bmw\.title/);
});

test("una fotografía perdida se detecta aunque las demás coincidan", () => {
  const rebuilt = structuredClone(projects);
  rebuilt[0].images.pop();

  const problems = compareProjects(projects, rebuilt);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /borghetto\.images/);
});

test("el informe fallido enumera las diferencias para poder corregirlas", () => {
  const report = formatProjectProblems(["primera diferencia", "segunda diferencia"]);
  assert.equal(report.ok, false);
  assert.match(report.message, /FALLO: 2 problema/);
  assert.match(report.message, /primera diferencia/);
  assert.match(report.message, /segunda diferencia/);
});

test("el informe correcto confirma que no se perdió contenido", () => {
  assert.deepEqual(formatProjectProblems([]), {
    ok: true,
    message: "OK: los proyectos reconstruyen exactamente el contenido original.",
  });
});
