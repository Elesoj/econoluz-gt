import "server-only";

import { neon } from "@neondatabase/serverless";
import {
  createProject,
  moveProject,
  readAdminProject,
  readAdminProjects,
  readProjectTypes,
  saveProject,
  setProjectPublished,
  type AdminProjectDetail,
  type AdminProjectSummary,
  type ProjectInput,
  type ProjectMoveDirection,
  type ProjectPublicationResult,
} from "./model";

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL.");
  const sql = neon(connectionString);
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>;
}

export function getAdminProjects(): Promise<AdminProjectSummary[]> {
  return readAdminProjects(connect());
}

export function getAdminProject(id: string): Promise<AdminProjectDetail | null> {
  return readAdminProject(connect(), id);
}

export function getProjectTypes(): Promise<string[]> {
  return readProjectTypes(connect());
}

export function createAdminProject(id: string, input: ProjectInput): Promise<string> {
  return createProject(connect(), id, input);
}

export function saveAdminProject(id: string, input: ProjectInput): Promise<void> {
  return saveProject(connect(), id, input);
}

export function moveAdminProject(id: string, direction: ProjectMoveDirection): Promise<void> {
  return moveProject(connect(), id, direction);
}

export function setAdminProjectPublished(
  id: string,
  published: boolean,
): Promise<ProjectPublicationResult> {
  return setProjectPublished(connect(), id, published);
}

