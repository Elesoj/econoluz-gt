import type { AdminAuthQuery } from "../auth/types";
import type { ProjectMoveDirection } from "./model";

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export type ProjectImageResult = { ok: true } | { ok: false; error: string };

export function isValidProjectImageUrl(value: string) {
  const clean = value.trim();
  if (clean.startsWith("/proyectos/")) return true;

  try {
    const url = new URL(clean);
    return (
      url.protocol === "https:" &&
      BLOB_HOST.test(url.hostname) &&
      url.pathname.startsWith("/proyectos/")
    );
  } catch {
    return false;
  }
}

export async function projectExists(query: AdminAuthQuery, projectId: string): Promise<boolean> {
  const rows = await query("select exists(select 1 from projects where id = $1) as exists", [
    projectId,
  ]);
  return Boolean(rows[0]?.exists);
}

export async function registerProjectImage(
  query: AdminAuthQuery,
  projectId: string,
  value: string,
): Promise<void> {
  const url = value.trim();
  if (!isValidProjectImageUrl(url)) {
    throw new Error("La ruta de la fotografía no es válida.");
  }
  if (!(await projectExists(query, projectId))) {
    throw new Error("Ese proyecto no existe.");
  }

  await query(
    `insert into project_images (project_id, url, position, visible)
     select $1, $2, coalesce(max(position), 0) + 10, true
     from project_images
     where project_id = $1
     on conflict (project_id, url) do nothing`,
    [projectId, url],
  );
}

function validImageId(imageId: number) {
  return Number.isSafeInteger(imageId) && imageId > 0;
}

export async function moveProjectImage(
  query: AdminAuthQuery,
  projectId: string,
  imageId: number,
  direction: ProjectMoveDirection,
): Promise<ProjectImageResult> {
  if (!validImageId(imageId)) return { ok: false, error: "Fotografía no válida." };

  const neighbour =
    direction === "up"
      ? "position < (select position from current_image) order by position desc"
      : "position > (select position from current_image) order by position asc";

  await query(
    `with current_image as (
       select id, project_id, position
       from project_images
       where project_id = $1 and id = $2
     ), neighbour as (
       select id, position
       from project_images
       where project_id = $1 and ${neighbour}
       limit 1
     )
     update project_images i
     set position = case
       when i.id = (select id from current_image) then (select position from neighbour)
       else (select position from current_image)
     end
     where i.project_id = $1
       and i.id in ((select id from current_image), (select id from neighbour))`,
    [projectId, imageId],
  );
  return { ok: true };
}

export async function setProjectImageVisible(
  query: AdminAuthQuery,
  projectId: string,
  imageId: number,
  visible: boolean,
): Promise<ProjectImageResult> {
  if (!validImageId(imageId)) return { ok: false, error: "Fotografía no válida." };

  if (!visible) {
    const rows = await query(
      `select p.published,
              i.visible as image_visible,
              (select count(*) from project_images
               where project_id = p.id and visible) as visible_images
       from projects p
       join project_images i on i.project_id = p.id and i.id = $2
       where p.id = $1`,
      [projectId, imageId],
    );
    if (rows.length === 0) return { ok: false, error: "Esa fotografía ya no existe." };
    if (
      Boolean(rows[0].published) &&
      Boolean(rows[0].image_visible) &&
      Number(rows[0].visible_images) <= 1
    ) {
      return {
        ok: false,
        error: "Un proyecto publicado necesita al menos una fotografía visible.",
      };
    }
  }

  await query(
    "update project_images set visible = $1 where project_id = $2 and id = $3",
    [visible, projectId, imageId],
  );
  return { ok: true };
}

