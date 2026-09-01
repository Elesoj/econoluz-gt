import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const PERMITIDO = "app/lib/datos";

/**
 * **La lista está vacía y así debe seguir.** Los once accesos que abrían su
 * propia conexión con `@neondatabase/serverless` pasaron a `app/lib/datos` en
 * la tarea 10, de modo que la regla ya no tiene ninguna excepción: dentro de
 * `app/**`, solo `app/lib/datos` importa el controlador.
 *
 * Se conserva la lista, y no una comprobación de lista vacía, para que añadir
 * una excepción nueva tenga que escribirse aquí y se vea en el diff. La prueba
 * falla en dos direcciones: si aparece un archivo que importa el controlador y
 * no está en la lista, y si algo listado deja de importarlo y nadie borra su
 * entrada, para que la lista nunca mienta sobre el estado real del código.
 */
const EXCEPCIONES_TRANSITORIAS: string[] = [];

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Normaliza a barras `/` para que la lista no dependa del sistema operativo. */
function aRutaPosix(ruta: string): string {
  return ruta.split(sep).join("/");
}

test("dentro de app/**, solo app/lib/datos importa el controlador de Neon", () => {
  const encontrados = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => readFileSync(ruta, "utf8").includes("@neondatabase/serverless"))
    .map((ruta) => aRutaPosix(relative(RAIZ, ruta)))
    .filter((ruta) => !ruta.startsWith(PERMITIDO));

  assert.deepEqual(
    [...encontrados].sort(),
    [...EXCEPCIONES_TRANSITORIAS].sort(),
    `La lista de excepciones ya no coincide con la realidad. Archivos que importan el ` +
      `controlador fuera de ${PERMITIDO}:\n${encontrados.join("\n") || "(ninguno)"}\n\n` +
      `Excepciones documentadas:\n${EXCEPCIONES_TRANSITORIAS.join("\n") || "(ninguna)"}`,
  );
});

test("la regla no alcanza a scripts/, y eso es a propósito", () => {
  // scripts/migrate.mjs crea el esquema del que depende la capa: se conecta
  // solo, y esta prueba documenta que la exclusión es deliberada.
  const migrador = readFileSync(join(RAIZ, "scripts", "migrate.mjs"), "utf8");
  assert.ok(migrador.includes("@neondatabase/serverless"));
});
