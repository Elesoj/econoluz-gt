import "server-only";

import { leer } from "../lib/datos";
import { unstable_cache } from "next/cache";
import { projects, toPublicProject, type PublicProject } from "./projects";
import { readPublicProjects, resolvePublicProjects } from "./projectsQuery";

export const PROJECTS_CACHE_TAG = "proyectos";
const PROJECTS_REVALIDATE_SECONDS = 3600;

// La lectura va por la capa de datos. La comprobación de `DATABASE_URL` se
// queda aquí con su mensaje de siempre: lanzar es justamente lo que hace que
// `resolvePublicProjects` caiga a la galería escrita en el código.
async function readProjectsFromDatabase(): Promise<PublicProject[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("falta DATABASE_URL");
  }

  return readPublicProjects((text, params) =>
    leer<Record<string, unknown>>(text, params),
  );
}

const getCachedProjects = unstable_cache(
  readProjectsFromDatabase,
  ["proyectos-publicos"],
  {
    tags: [PROJECTS_CACHE_TAG],
    revalidate: PROJECTS_REVALIDATE_SECONDS,
  },
);

const projectsFromCode = () => projects.map(toPublicProject);

export async function getPublicProjects(): Promise<PublicProject[]> {
  if (!process.env.DATABASE_URL) {
    console.warn("[proyectos] sin DATABASE_URL: se muestra la galería escrita en el código.");
    return projectsFromCode();
  }

  return resolvePublicProjects(
    () => getCachedProjects(),
    projectsFromCode,
    (error) =>
      console.error(
        "[proyectos] Neon no respondió; se muestra la galería escrita en el código:",
        error,
      ),
  );
}
