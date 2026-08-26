import type { ProjectSource, PublicProject } from "./projects";

export const PROJECT_POSITION_STEP = 10;

export type ProjectRow = {
  id: string;
  position: number;
  title: string;
  type: string;
  description: string;
  published: boolean;
};

export type ProjectImageRow = {
  project_id: string;
  url: string;
  position: number;
  visible: boolean;
};

export const PROJECT_COLUMNS = ["id", "position", "title", "type", "description"] as const;
export const PROJECT_IMAGE_COLUMNS = ["project_id", "url", "position"] as const;

export function toProjectRows(source: readonly ProjectSource[]): {
  projects: ProjectRow[];
  images: ProjectImageRow[];
} {
  return {
    projects: source.map((project, index) => ({
      id: project.id,
      position: (index + 1) * PROJECT_POSITION_STEP,
      title: project.title,
      type: project.type,
      description: project.description,
      published: true,
    })),
    images: source.flatMap((project) =>
      project.images.map((url, index) => ({
        project_id: project.id,
        url,
        position: (index + 1) * PROJECT_POSITION_STEP,
        visible: true,
      })),
    ),
  };
}

export function fromProjectRows(
  projectRows: readonly ProjectRow[],
  imageRows: readonly ProjectImageRow[],
): ProjectSource[] {
  const imagesByProject = new Map<string, ProjectImageRow[]>();

  for (const image of imageRows) {
    const current = imagesByProject.get(image.project_id) ?? [];
    current.push(image);
    imagesByProject.set(image.project_id, current);
  }

  return [...projectRows]
    .sort((left, right) => left.position - right.position)
    .map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      images: [...(imagesByProject.get(row.id) ?? [])]
        .filter(({ visible }) => visible)
        .sort((left, right) => left.position - right.position)
        .map(({ url }) => url),
    }));
}

export function projectRowsToPublic(
  projectRows: readonly ProjectRow[],
  imageRows: readonly ProjectImageRow[],
): PublicProject[] {
  return fromProjectRows(projectRows, imageRows).map(
    ({ type, title, description, images }) => ({
      type,
      title,
      description,
      images,
    }),
  );
}
