const VALID_PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const VALID_UNIQUE_ID = /^[a-z0-9-]+$/i;

export const PROJECT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PROJECT_IMAGE_CONTENT_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/avif",
] as const;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

export function parseProjectUploadPayload(value: string | null): { projectId: string } {
  try {
    const parsed = JSON.parse(value ?? "") as { projectId?: unknown };
    if (typeof parsed.projectId !== "string" || !VALID_PROJECT_ID.test(parsed.projectId)) {
      throw new Error();
    }
    return { projectId: parsed.projectId };
  } catch {
    throw new Error("No se ha indicado un proyecto válido.");
  }
}

export function projectImageExtension(contentType: string): string | null {
  return MIME_EXTENSIONS[contentType] ?? null;
}

export function buildProjectBlobPath(
  projectId: string,
  originalName: string,
  uniqueId: string,
): string {
  if (!VALID_PROJECT_ID.test(projectId) || !VALID_UNIQUE_ID.test(uniqueId)) {
    throw new Error("No se puede construir la ruta de la fotografía.");
  }

  const originalExtension = originalName.split(".").pop()?.toLowerCase();
  const extension = originalExtension === "jpeg" ? "jpg" : originalExtension;
  const safeExtension = ["webp", "jpg", "png", "avif"].includes(extension ?? "")
    ? extension
    : "webp";
  return `proyectos/${projectId}/${uniqueId}.${safeExtension}`;
}

type UploadDependencies = {
  projectExists: (projectId: string) => Promise<boolean>;
  registerImage: (projectId: string, url: string) => Promise<void>;
};

export function createProjectUploadCallbacks(dependencies: UploadDependencies) {
  return {
    async before(pathname: string, clientPayload: string | null) {
      const { projectId } = parseProjectUploadPayload(clientPayload);
      if (!(await dependencies.projectExists(projectId))) {
        throw new Error("Ese proyecto no existe.");
      }
      if (!pathname.startsWith(`proyectos/${projectId}/`)) {
        throw new Error("La ruta de subida no pertenece al proyecto.");
      }

      return {
        allowedContentTypes: [...PROJECT_IMAGE_CONTENT_TYPES],
        maximumSizeInBytes: PROJECT_IMAGE_MAX_BYTES,
        addRandomSuffix: false,
        allowOverwrite: false,
        tokenPayload: JSON.stringify({ projectId }),
      };
    },

    async completed(blob: { url: string }, tokenPayload: string | null) {
      const { projectId } = parseProjectUploadPayload(tokenPayload);
      await dependencies.registerImage(projectId, blob.url);
    },
  };
}

