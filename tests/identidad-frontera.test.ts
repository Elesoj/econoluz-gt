import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

function archivosDe(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const aPosix = (ruta: string) => relative(RAIZ, ruta).split(sep).join("/");

test("solo firebase.server.ts importa firebase-admin", () => {
  const infractores = [...archivosDe(join(RAIZ, "app")), ...archivosDe(join(RAIZ, "scripts"))]
    .filter((ruta) => readFileSync(ruta, "utf8").includes("firebase-admin"))
    .map(aPosix)
    .filter((ruta) => ruta !== "app/identidad/firebase.server.ts");

  assert.deepEqual(
    infractores,
    [],
    `Solo app/identidad/firebase.server.ts puede importar firebase-admin. Lo importan ` +
      `además:\n${infractores.join("\n")}`,
  );
});

test("la identidad de clientes no importa nada del panel, ni al revés", () => {
  const clientes = [
    ...archivosDe(join(RAIZ, "app", "identidad")),
    ...archivosDe(join(RAIZ, "app", "cuenta")),
  ];
  const invasores = clientes
    .filter((ruta) => /from "[^"]*app\/admin|from "\.\.\/admin|from "\.\.\/\.\.\/admin/.test(readFileSync(ruta, "utf8")))
    .map(aPosix);

  assert.deepEqual(invasores, [], `Módulos de clientes que importan del panel:\n${invasores.join("\n")}`);

  const panel = archivosDe(join(RAIZ, "app", "admin"));
  const contaminados = panel
    .filter((ruta) => /from "[^"]*identidad\/|from "[^"]*app\/cuenta/.test(readFileSync(ruta, "utf8")))
    .map(aPosix);

  assert.deepEqual(contaminados, [], `Módulos del panel que importan de clientes:\n${contaminados.join("\n")}`);
});

test("nadie verifica tokens de Firebase con jose", () => {
  const conJose = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => readFileSync(ruta, "utf8").includes('from "jose"'))
    .map(aPosix);

  assert.deepEqual(conJose, [], "Los tokens de Firebase se verifican con firebase-admin, nunca con jose.");
});
