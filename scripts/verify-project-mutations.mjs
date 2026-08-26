import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL.");

const sql = neon(connectionString);
const projectId = "agencia-bmw";
const [originalProject] = await sql.query(
  "select title, published from projects where id = $1",
  [projectId],
);
const [originalImage] = await sql.query(
  `select id, visible
   from project_images
   where project_id = $1 and visible
   order by position
   limit 1`,
  [projectId],
);

if (!originalProject || !originalImage) {
  throw new Error("No se encontró Agencia BMW o su fotografía inicial.");
}

const result = {};

try {
  await sql.query("update projects set title = $1 where id = $2", [
    `${originalProject.title} — prueba`,
    projectId,
  ]);
  const [changed] = await sql.query("select title from projects where id = $1", [projectId]);
  result.titleChanged = changed.title.endsWith("— prueba");

  await sql.query("update projects set title = $1 where id = $2", [
    originalProject.title,
    projectId,
  ]);

  const [beforeRow] = await sql.query(
    "select count(*) as total from project_images where project_id = $1 and visible",
    [projectId],
  );
  await sql.query("update project_images set visible = false where id = $1", [originalImage.id]);
  const [hiddenRow] = await sql.query(
    "select count(*) as total from project_images where project_id = $1 and visible",
    [projectId],
  );
  result.imageCount = [Number(beforeRow.total), Number(hiddenRow.total)];

  await sql.query("update project_images set visible = $1 where id = $2", [
    originalImage.visible,
    originalImage.id,
  ]);
  await sql.query("update projects set published = false where id = $1", [projectId]);
  const [hiddenProject] = await sql.query(
    "select count(*) as total from projects where id = $1 and published",
    [projectId],
  );
  result.publicCountWhileHidden = Number(hiddenProject.total);
} finally {
  await sql.query("update projects set title = $1, published = $2 where id = $3", [
    originalProject.title,
    originalProject.published,
    projectId,
  ]);
  await sql.query("update project_images set visible = $1 where id = $2", [
    originalImage.visible,
    originalImage.id,
  ]);
}

const [restored] = await sql.query("select title, published from projects where id = $1", [
  projectId,
]);
const [restoredImages] = await sql.query(
  "select count(*) as total from project_images where project_id = $1 and visible",
  [projectId],
);
result.restored = {
  title: restored.title,
  published: restored.published,
  visibleImages: Number(restoredImages.total),
};

if (
  result.titleChanged !== true ||
  result.imageCount[1] !== result.imageCount[0] - 1 ||
  result.publicCountWhileHidden !== 0 ||
  result.restored.title !== originalProject.title ||
  result.restored.published !== originalProject.published ||
  result.restored.visibleImages !== result.imageCount[0]
) {
  throw new Error(`La prueba reversible no terminó como se esperaba: ${JSON.stringify(result)}`);
}

console.log("OK: edición, ocultación y despublicación funcionaron y quedaron restauradas.");
console.log(`BMW visible: ${result.imageCount[0]} → ${result.imageCount[1]} → ${result.restored.visibleImages} fotos.`);

