import "server-only";

import { neon } from "@neondatabase/serverless";
import {
  moveProjectImage,
  projectExists,
  registerProjectImage,
  setProjectImageVisible,
  type ProjectImageResult,
} from "./imagenes";
import type { ProjectMoveDirection } from "./model";

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL.");
  const sql = neon(connectionString);
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    sql.query(text, [...params]) as Promise<Record<string, unknown>[]>;
}

export function adminProjectExists(projectId: string): Promise<boolean> {
  return projectExists(connect(), projectId);
}

export function registerAdminProjectImage(projectId: string, url: string): Promise<void> {
  return registerProjectImage(connect(), projectId, url);
}

export function moveAdminProjectImage(
  projectId: string,
  imageId: number,
  direction: ProjectMoveDirection,
): Promise<ProjectImageResult> {
  return moveProjectImage(connect(), projectId, imageId, direction);
}

export function setAdminProjectImageVisible(
  projectId: string,
  imageId: number,
  visible: boolean,
): Promise<ProjectImageResult> {
  return setProjectImageVisible(connect(), projectId, imageId, visible);
}

