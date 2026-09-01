import "server-only";

import { leer } from "../../lib/datos";
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

/**
 * Solo la conexión, ahora por la capa de datos. Cada operación de `model.ts`
 * resuelve una sola sentencia —incluido el reordenamiento, que va con `with`—,
 * salvo `setProjectPublished`, que lee antes de escribir sin transacción. Se
 * deja como estaba: el traslado no cambia comportamiento, y esa atomicidad es
 * una decisión aparte anotada en la documentación.
 *
 * La comprobación de `DATABASE_URL` se conserva para que el error siga saliendo
 * aquí y no en la primera consulta.
 */
function connect() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
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

