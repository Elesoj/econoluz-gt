// Ensayo de la migración de proyectos sin tocar la base de datos.

import { projects } from "../app/data/projects.ts";
import { fromProjectRows, toProjectRows } from "../app/data/projectRow.ts";
import { compareProjects, formatProjectProblems } from "./compare-projects.mjs";

const rows = toProjectRows(projects);

// Postgres puede devolver posiciones numéricas como texto según el tipo y el
// adaptador. Simularlo aquí evita descubrir una ordenación lexicográfica al
// leer la base real.
const projectRowsFromDatabase = rows.projects.map((row) => ({
  ...structuredClone(row),
  position: Number(String(row.position)),
}));
const imageRowsFromDatabase = rows.images.map((row) => ({
  ...structuredClone(row),
  position: Number(String(row.position)),
}));

const rebuilt = fromProjectRows(projectRowsFromDatabase, imageRowsFromDatabase);
const report = formatProjectProblems(compareProjects(projects, rebuilt));

console.log(`Proyectos leídos:  ${projects.length}`);
console.log(`Fotos leídas:      ${projects.flatMap(({ images }) => images).length}`);
console.log("");
console.log(report.message);

if (!report.ok) {
  process.exitCode = 1;
}
