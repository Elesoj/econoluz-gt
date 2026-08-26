import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectBlobPath,
  createProjectUploadCallbacks,
  parseProjectUploadPayload,
  projectImageExtension,
} from "../app/admin/proyectos/upload";

test("extrae un proyecto válido del payload", () => {
  assert.deepEqual(parseProjectUploadPayload('{"projectId":"abc-123"}'), {
    projectId: "abc-123",
  });
});

test("rechaza JSON roto, ausente o sin identificador", () => {
  for (const payload of [null, "{", "{}", '{"projectId":""}', '{"projectId":"../otro"}']) {
    assert.throws(() => parseProjectUploadPayload(payload), /proyecto/i);
  }
});

test("construye una ruta anónima dentro de la carpeta del proyecto", () => {
  const path = buildProjectBlobPath("abc", "foto.JPG", "uuid");
  assert.equal(path, "proyectos/abc/uuid.jpg");
  assert.equal(path.toLowerCase().includes("foto"), false);
});

test("traduce solo los cuatro tipos de imagen admitidos", () => {
  assert.equal(projectImageExtension("image/webp"), "webp");
  assert.equal(projectImageExtension("image/jpeg"), "jpg");
  assert.equal(projectImageExtension("image/png"), "png");
  assert.equal(projectImageExtension("image/avif"), "avif");
  assert.equal(projectImageExtension("application/pdf"), null);
});

test("el token exige un proyecto existente y una ruta dentro de su carpeta", async () => {
  const missing = createProjectUploadCallbacks({
    projectExists: async () => false,
    registerImage: async () => {},
  });
  await assert.rejects(
    missing.before("proyectos/abc/u.webp", '{"projectId":"abc"}'),
    /no existe/i,
  );

  const callbacks = createProjectUploadCallbacks({
    projectExists: async () => true,
    registerImage: async () => {},
  });
  await assert.rejects(
    callbacks.before("proyectos/otro/u.webp", '{"projectId":"abc"}'),
    /no pertenece/i,
  );
});

test("emite un token limitado a imágenes de 4 MB y sin renombrado adicional", async () => {
  const callbacks = createProjectUploadCallbacks({
    projectExists: async (projectId) => projectId === "abc",
    registerImage: async () => {},
  });
  const options = await callbacks.before("proyectos/abc/u.webp", '{"projectId":"abc"}');

  assert.deepEqual(options.allowedContentTypes, [
    "image/webp",
    "image/jpeg",
    "image/png",
    "image/avif",
  ]);
  assert.equal(options.maximumSizeInBytes, 4 * 1024 * 1024);
  assert.equal(options.addRandomSuffix, false);
  assert.equal(options.allowOverwrite, false);
  assert.equal(options.tokenPayload, '{"projectId":"abc"}');
});

test("el callback registra exactamente la URL y repetirlo conserva el mismo contrato", async () => {
  const records: { projectId: string; url: string }[] = [];
  const callbacks = createProjectUploadCallbacks({
    projectExists: async () => true,
    registerImage: async (projectId, url) => {
      records.push({ projectId, url });
    },
  });
  const blob = {
    url: "https://abc.public.blob.vercel-storage.com/proyectos/abc/u.webp",
  };

  await callbacks.completed(blob, '{"projectId":"abc"}');
  await callbacks.completed(blob, '{"projectId":"abc"}');
  assert.deepEqual(records, [
    { projectId: "abc", url: blob.url },
    { projectId: "abc", url: blob.url },
  ]);
});
