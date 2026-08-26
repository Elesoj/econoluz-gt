import type { AdminAuthQuery } from "../auth/types";

export type ProjectInput = {
  title: string;
  type: string;
  description: string;
};

export type ProjectValidation =
  | { ok: true; data: ProjectInput }
  | { ok: false; error: string };

export type AdminProjectSummary = ProjectInput & {
  id: string;
  position: number;
  published: boolean;
  visibleImages: number;
  totalImages: number;
};

export type AdminProjectImage = {
  id: number;
  url: string;
  position: number;
  visible: boolean;
};

export type AdminProjectDetail = AdminProjectSummary & {
  images: AdminProjectImage[];
};

export type ProjectPublicationResult = { ok: true } | { ok: false; error: string };
export type ProjectMoveDirection = "up" | "down";

export function validateProjectInput(input: ProjectInput): ProjectValidation {
  const data = {
    title: input.title.trim(),
    type: input.type.trim(),
    description: input.description.trim(),
  };

  if (!data.title) return { ok: false, error: "Escribe el título del proyecto." };
  if (!data.type) return { ok: false, error: "Escribe el tipo de proyecto." };
  if (!data.description) return { ok: false, error: "Escribe la descripción del proyecto." };

  return { ok: true, data };
}

function toSummary(row: Record<string, unknown>): AdminProjectSummary {
  return {
    id: String(row.id),
    position: Number(row.position),
    title: String(row.title),
    type: String(row.type),
    description: String(row.description),
    published: Boolean(row.published),
    visibleImages: Number(row.visible_images),
    totalImages: Number(row.total_images),
  };
}

const PROJECT_SUMMARY_SELECT = `
  select p.id,
         p.position,
         p.title,
         p.type,
         p.description,
         p.published,
         count(i.id) filter (where i.visible) as visible_images,
         count(i.id) as total_images
  from projects p
  left join project_images i on i.project_id = p.id
`;

export async function readAdminProjects(query: AdminAuthQuery): Promise<AdminProjectSummary[]> {
  const rows = await query(
    `${PROJECT_SUMMARY_SELECT}
     group by p.id
     order by p.position`,
    [],
  );
  return rows.map(toSummary);
}

export async function readAdminProject(
  query: AdminAuthQuery,
  id: string,
): Promise<AdminProjectDetail | null> {
  const projects = await query(
    `${PROJECT_SUMMARY_SELECT}
     where p.id = $1
     group by p.id`,
    [id],
  );
  if (projects.length === 0) return null;

  const images = await query(
    `select id, url, position, visible
     from project_images
     where project_id = $1
     order by position`,
    [id],
  );

  return {
    ...toSummary(projects[0]),
    images: images.map((row) => ({
      id: Number(row.id),
      url: String(row.url),
      position: Number(row.position),
      visible: Boolean(row.visible),
    })),
  };
}

export async function readProjectTypes(query: AdminAuthQuery): Promise<string[]> {
  const rows = await query("select distinct type from projects order by type", []);
  return rows.map((row) => String(row.type));
}

export async function createProject(
  query: AdminAuthQuery,
  id: string,
  input: ProjectInput,
): Promise<string> {
  const rows = await query(
    `insert into projects (id, position, title, type, description, published)
     select $1, coalesce(max(position), 0) + 10, $2, $3, $4, false
     from projects
     returning id`,
    [id, input.title, input.type, input.description],
  );
  return String(rows[0]?.id ?? id);
}

export async function saveProject(
  query: AdminAuthQuery,
  id: string,
  input: ProjectInput,
): Promise<void> {
  await query(
    `update projects
     set title = $1, type = $2, description = $3
     where id = $4`,
    [input.title, input.type, input.description, id],
  );
}

export async function setProjectPublished(
  query: AdminAuthQuery,
  id: string,
  published: boolean,
): Promise<ProjectPublicationResult> {
  if (published) {
    const rows = await query(
      `select count(*) as visible_images
       from project_images
       where project_id = $1 and visible`,
      [id],
    );
    if (Number(rows[0]?.visible_images ?? 0) === 0) {
      return {
        ok: false,
        error: "Añade al menos una fotografía visible antes de publicar.",
      };
    }
  }

  await query("update projects set published = $1 where id = $2", [published, id]);
  return { ok: true };
}

export async function moveProject(
  query: AdminAuthQuery,
  id: string,
  direction: ProjectMoveDirection,
): Promise<void> {
  const neighbour =
    direction === "up"
      ? "position < (select position from current_project) order by position desc"
      : "position > (select position from current_project) order by position asc";

  await query(
    `with current_project as (
       select id, position from projects where id = $1
     ), neighbour as (
       select id, position from projects
       where ${neighbour}
       limit 1
     )
     update projects p
     set position = case
       when p.id = (select id from current_project) then (select position from neighbour)
       else (select position from current_project)
     end
     where p.id in ((select id from current_project), (select id from neighbour))`,
    [id],
  );
}

