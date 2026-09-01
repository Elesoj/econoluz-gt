import "server-only";

import { leer } from "../../lib/datos";
import {
  moveProjectImage,
  projectExists,
  registerProjectImage,
  setProjectImageVisible,
  type ProjectImageResult,
} from "./imagenes";
import type { ProjectMoveDirection } from "./model";

/**
 * Solo la conexión, ahora por la capa de datos, con la comprobación de
 * `DATABASE_URL` en el mismo sitio que antes del traslado.
 *
 * `moveProjectImage` y `setProjectImageVisible` leen antes de escribir sin
 * transacción. Se deja igual: este paso traslada el acceso sin cambiar
 * comportamiento, y esa atomicidad es una decisión aparte, anotada en
 * `docs/CONTINUAR-PANEL.md`.
 */
function connect() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
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

