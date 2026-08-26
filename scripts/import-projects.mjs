// Importa la galería actual en Neon y vuelve a leerla para comprobarla.

import { Client, neonConfig } from "@neondatabase/serverless";
import { projects } from "../app/data/projects.ts";
import {
  PROJECT_COLUMNS,
  PROJECT_IMAGE_COLUMNS,
  fromProjectRows,
  toProjectRows,
} from "../app/data/projectRow.ts";
import { compareProjects, formatProjectProblems } from "./compare-projects.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Falta DATABASE_URL.\n\n" +
      "Abre frontend/.env.local y pega ahí la cadena de conexión de Neon.",
  );
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;

const rows = toProjectRows(projects);
const projectIds = rows.projects.map(({ id }) => id);
const client = new Client(connectionString);

console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log(`Proyectos:      ${rows.projects.length}`);
console.log(`Fotografías:    ${rows.images.length}`);
console.log("");

await client.connect();

try {
  await client.query("begin");

  try {
    for (const row of rows.projects) {
      const values = PROJECT_COLUMNS.map((column) => row[column]);
      const placeholders = values.map((_, index) => `$${index + 1}`);

      await client.query(
        `insert into projects (${PROJECT_COLUMNS.join(", ")}, published)
         values (${placeholders.join(", ")}, true)
         on conflict (id) do nothing`,
        values,
      );
    }

    for (const row of rows.images) {
      const values = PROJECT_IMAGE_COLUMNS.map((column) => row[column]);
      const placeholders = values.map((_, index) => `$${index + 1}`);

      await client.query(
        `insert into project_images (${PROJECT_IMAGE_COLUMNS.join(", ")}, visible)
         values (${placeholders.join(", ")}, true)
         on conflict (project_id, url) do nothing`,
        values,
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const storedProjects = await client.query(
    `select id, position, title, type, description, published
     from projects
     where id = any($1::text[])
     order by position`,
    [projectIds],
  );
  const storedImages = await client.query(
    `select project_id, url, position, visible
     from project_images
     where project_id = any($1::text[])
     order by project_id, position`,
    [projectIds],
  );
  const totals = await client.query(
    `select
       (select count(*)::int from projects) as projects,
       (select count(*)::int from projects where published) as published,
       (select count(*)::int from project_images) as images,
       (select count(*)::int from project_images where visible) as visible`,
  );

  const rebuilt = fromProjectRows(
    storedProjects.rows.map((row) => ({
      id: String(row.id),
      position: Number(row.position),
      title: String(row.title),
      type: String(row.type),
      description: String(row.description),
      published: Boolean(row.published),
    })),
    storedImages.rows.map((row) => ({
      project_id: String(row.project_id),
      url: String(row.url),
      position: Number(row.position),
      visible: Boolean(row.visible),
    })),
  );
  const report = formatProjectProblems(compareProjects(projects, rebuilt));
  const total = totals.rows[0];

  console.log(`En la tabla:     ${total.projects} proyectos, ${total.images} fotografías`);
  console.log(`Publicados:      ${total.published}`);
  console.log(`Fotos visibles:  ${total.visible}`);
  console.log("");
  console.log(report.message);

  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
