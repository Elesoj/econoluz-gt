"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerUploadedProjectImageAction } from "../../../proyectos/actions";
import {
  buildProjectBlobPath,
  PROJECT_IMAGE_MAX_BYTES,
  projectImageExtension,
} from "../../../proyectos/upload";

type UploadState = {
  name: string;
  status: "pendiente" | "subiendo" | "lista" | "error";
  error?: string;
};

export default function ProjectImageUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [states, setStates] = useState<UploadState[]>([]);

  const updateState = (index: number, change: Partial<UploadState>) => {
    setStates((current) =>
      current.map((state, stateIndex) =>
        stateIndex === index ? { ...state, ...change } : state,
      ),
    );
  };

  async function selectFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = [...files];
    setStates(selected.map((file) => ({ name: file.name, status: "pendiente" })));
    setProcessing(true);

    for (const [index, file] of selected.entries()) {
      const extension = projectImageExtension(file.type);
      if (!extension) {
        updateState(index, {
          status: "error",
          error: "Formato no permitido. Usa webp, jpg, png o avif.",
        });
        continue;
      }
      if (file.size <= 0 || file.size > PROJECT_IMAGE_MAX_BYTES) {
        updateState(index, {
          status: "error",
          error: file.size <= 0 ? "El archivo está vacío." : "La fotografía supera 4 MB.",
        });
        continue;
      }

      updateState(index, { status: "subiendo", error: undefined });
      try {
        const pathname = buildProjectBlobPath(projectId, `image.${extension}`, crypto.randomUUID());
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/admin/proyectos/subir",
          clientPayload: JSON.stringify({ projectId }),
        });
        await registerUploadedProjectImageAction(projectId, blob.url);
        updateState(index, { status: "lista" });
      } catch {
        updateState(index, {
          status: "error",
          error: "No se pudo subir o registrar esta fotografía.",
        });
      }
    }

    setProcessing(false);
    router.refresh();
  }

  return (
    <div className="mt-5 border-l-2 border-proyectos bg-neutral-50 p-5">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-proyectos/30 bg-white px-5 text-sm font-semibold text-proyectos transition hover:bg-proyectos hover:text-white">
        {processing ? "Subiendo…" : "Seleccionar fotografías"}
        <input
          type="file"
          multiple
          accept="image/webp,image/jpeg,image/png,image/avif"
          disabled={processing}
          onChange={(event) => void selectFiles(event.currentTarget.files)}
          className="sr-only"
        />
      </label>
      <p className="mt-3 text-xs leading-5 text-neutral-600">
        Puedes elegir varias. Formatos webp, jpg, png o avif; máximo 4 MB por archivo.
      </p>
      {states.length > 0 ? (
        <ul aria-live="polite" className="mt-4 space-y-2 text-sm">
          {states.map((state, index) => (
            <li key={`${state.name}-${index}`} className={state.status === "error" ? "text-error" : "text-proyectos"}>
              <span className="font-semibold">{state.name}</span>: {state.error ?? state.status}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

