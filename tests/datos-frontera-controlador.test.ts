import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const PERMITIDO = "app/lib/datos";

/**
 * Lista de excepciones transitoria. Son los archivos de `app/**` que hoy
 * todavía abren su propia conexión con `@neondatabase/serverless` en lugar de
 * pasar por `app/lib/datos`. Migrarlos es la tarea 10, que los va sacando de
 * aquí uno a uno hasta dejar esta lista vacía; a partir de ahí la regla no
 * tendrá ninguna excepción.
 *
 * Mientras tanto, la prueba falla en dos direcciones: si aparece un archivo
 * nuevo que importa el controlador y no está aquí, y si uno de estos deja de
 * importarlo y nadie borra su entrada, para que la lista nunca mienta sobre
 * el estado real de la migración.
 */
const EXCEPCIONES_TRANSITORIAS = [
  "app/api/leads/route.ts",
];

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

test("solo app/lib/datos importa el controlador de Neon, salvo las excepciones transitorias", () => {
  const encontrados = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => readFileSync(ruta, "utf8").includes("@neondatabase/serverless"))
    .map((ruta) => aRutaPosix(relative(RAIZ, ruta)))
    .filter((ruta) => !ruta.startsWith(PERMITIDO));

  assert.deepEqual(
    [...encontrados].sort(),
    [...EXCEPCIONES_TRANSITORIAS].sort(),
    `La lista de excepciones ya no coincide con la realidad. Archivos que importan el ` +
      `controlador fuera de ${PERMITIDO}:\n${encontrados.join("\n")}\n\n` +
      `Excepciones documentadas:\n${EXCEPCIONES_TRANSITORIAS.join("\n")}`,
  );
});

test("la regla no alcanza a scripts/, y eso es a propósito", () => {
  // scripts/migrate.mjs crea el esquema del que depende la capa: se conecta
  // solo, y esta prueba documenta que la exclusión es deliberada.
  const migrador = readFileSync(join(RAIZ, "scripts", "migrate.mjs"), "utf8");
  assert.ok(migrador.includes("@neondatabase/serverless"));
});
