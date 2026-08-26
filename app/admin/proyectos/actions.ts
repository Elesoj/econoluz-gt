"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { PROJECTS_CACHE_TAG } from "../../data/projects.server";
import { verificarSesionParaAccion } from "../auth/authorization.server";
import { validateProjectInput, type ProjectMoveDirection } from "./model";
import {
  createAdminProject,
  moveAdminProject,
  saveAdminProject,
  setAdminProjectPublished,
} from "./repository.server";

const VALID_PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

function projectId(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  return VALID_PROJECT_ID.test(id) ? id : null;
}

function projectInput(formData: FormData) {
  return validateProjectInput({
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
}

export async function createProjectAction(formData: FormData) {
  await verificarSesionParaAccion();
  const validation = projectInput(formData);
  if (!validation.ok) {
    redirect(`/admin/proyectos/nuevo?error=${encodeURIComponent(validation.error)}`);
  }

  const id = randomUUID();
  await createAdminProject(id, validation.data);
  updateTag(PROJECTS_CACHE_TAG);
  redirect(`/admin/proyectos/${id}?created=1`);
}

export async function saveProjectAction(formData: FormData) {
  await verificarSesionParaAccion();
  const id = projectId(formData);
  if (!id) redirect("/admin/proyectos?error=Proyecto%20no%20válido.");

  const validation = projectInput(formData);
  if (!validation.ok) {
    redirect(`/admin/proyectos/${id}?error=${encodeURIComponent(validation.error)}`);
  }

  await saveAdminProject(id, validation.data);
  updateTag(PROJECTS_CACHE_TAG);
  redirect(`/admin/proyectos/${id}?saved=1`);
}

export async function moveProjectAction(formData: FormData) {
  await verificarSesionParaAccion();
  const id = projectId(formData);
  const direction = String(formData.get("direction") ?? "") as ProjectMoveDirection;
  if (!id || (direction !== "up" && direction !== "down")) {
    redirect("/admin/proyectos?error=Movimiento%20no%20válido.");
  }

  await moveAdminProject(id, direction);
  updateTag(PROJECTS_CACHE_TAG);
  redirect("/admin/proyectos");
}

export async function setProjectPublishedAction(formData: FormData) {
  await verificarSesionParaAccion();
  const id = projectId(formData);
  if (!id) redirect("/admin/proyectos?error=Proyecto%20no%20válido.");

  const published = String(formData.get("published") ?? "") === "true";
  const requestedOrigin = String(formData.get("origin") ?? "");
  const origin =
    requestedOrigin === `/admin/proyectos/${id}` ? requestedOrigin : "/admin/proyectos";
  const result = await setAdminProjectPublished(id, published);
  if (!result.ok) redirect(`${origin}?error=${encodeURIComponent(result.error)}`);

  updateTag(PROJECTS_CACHE_TAG);
  redirect(origin);
}

