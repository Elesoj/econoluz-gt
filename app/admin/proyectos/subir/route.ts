import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { revalidateTag } from "next/cache";
import { PROJECTS_CACHE_TAG } from "../../../data/projects.server";
import { verificarSesion } from "../../auth/authorization.server";
import { adminProjectExists, registerAdminProjectImage } from "../imagenes.server";
import { createProjectUploadCallbacks } from "../upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    if (body.type === "blob.generate-client-token") {
      await verificarSesion();
    }

    const callbacks = createProjectUploadCallbacks({
      projectExists: adminProjectExists,
      registerImage: registerAdminProjectImage,
    });
    const onVercel =
      process.env.VERCEL === "1" || Boolean(process.env.VERCEL_BLOB_CALLBACK_URL);

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: (pathname, payload) => callbacks.before(pathname, payload),
      ...(onVercel
        ? {
            onUploadCompleted: async ({ blob, tokenPayload }: Parameters<
              NonNullable<Parameters<typeof handleUpload>[0]["onUploadCompleted"]>
            >[0]) => {
              await callbacks.completed(blob, tokenPayload ?? null);
              revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 });
            },
          }
        : {}),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[proyectos] falló la subida o su registro:", error);
    return Response.json({ error: "No se pudo completar la subida." }, { status: 400 });
  }
}

