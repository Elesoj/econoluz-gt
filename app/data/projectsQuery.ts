import type { PublicProject } from "./projects";

export type ProjectQuery = (
  text: string,
  params: readonly (string | number | boolean | null)[],
) => Promise<Record<string, unknown>[]>;

export async function resolvePublicProjects(
  readProjects: () => Promise<PublicProject[]>,
  fallback: () => PublicProject[],
  onError: (error: unknown) => void = () => {},
): Promise<PublicProject[]> {
  try {
    const projects = await readProjects();
    return projects.length > 0 ? projects : fallback();
  } catch (error) {
    onError(error);
    return fallback();
  }
}

type GroupedProject = Omit<PublicProject, "images"> & {
  position: number;
  images: { url: string; position: number }[];
};

export async function readPublicProjects(query: ProjectQuery): Promise<PublicProject[]> {
  const rows = await query(
    `
      select p.id as project_id,
             p.position as project_position,
             p.title,
             p.type,
             p.description,
             i.url as image_url,
             i.position as image_position
      from projects p
      join project_images i on i.project_id = p.id and i.visible
      where p.published
      order by p.position, i.position
    `,
    [],
  );
  const grouped = new Map<string, GroupedProject>();

  for (const row of rows) {
    const id = String(row.project_id);
    const project = grouped.get(id) ?? {
      title: String(row.title),
      type: String(row.type),
      description: String(row.description),
      position: Number(row.project_position),
      images: [],
    };

    project.images.push({
      url: String(row.image_url),
      position: Number(row.image_position),
    });
    grouped.set(id, project);
  }

  return [...grouped.values()]
    .sort((left, right) => left.position - right.position)
    .map(({ title, type, description, images }) => ({
      title,
      type,
      description,
      images: [...images]
        .sort((left, right) => left.position - right.position)
        .map(({ url }) => url),
    }));
}
