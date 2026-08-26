import "server-only";

import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";
import { projects, toPublicProject, type PublicProject } from "./projects";
import { readPublicProjects, resolvePublicProjects } from "./projectsQuery";

export const PROJECTS_CACHE_TAG = "proyectos";
const PROJECTS_REVALIDATE_SECONDS = 3600;

async function readProjectsFromDatabase(): Promise<PublicProject[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("falta DATABASE_URL");
  }

  const sql = neon(connectionString);
  return readPublicProjects((text, params) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>,
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
