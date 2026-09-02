import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

/**
 * Se miran también `.mjs` y `.js`, no solo TypeScript: los scripts de este
 * proyecto son `.mjs`, y una primera versión de esta prueba decía escanear
 * `scripts/` mientras en realidad no miraba ni un archivo.
 */
function archivosDe(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.(tsx?|mjs|js)$/.test(entrada.name) ? [ruta] : [];
  });
}

const aPosix = (ruta: string) => relative(RAIZ, ruta).split(sep).join("/");

const usaFirebaseAdmin = (ruta: string) =>
  /from "firebase-admin|require\("firebase-admin/.test(readFileSync(ruta, "utf8"));

/**
 * Dentro de `app/**` solo hay una puerta a `firebase-admin`, y no admite
 * excepciones.
 */
test("dentro de app/, solo firebase.server.ts importa firebase-admin", () => {
  const infractores = archivosDe(join(RAIZ, "app"))
    .filter(usaFirebaseAdmin)
    .map(aPosix)
    .filter((ruta) => ruta !== "app/identidad/firebase.server.ts");

  assert.deepEqual(
    infractores,
    [],
    `Solo app/identidad/firebase.server.ts puede importar firebase-admin dentro de app/. ` +
      `Lo importan además:\n${infractores.join("\n")}`,
  );
});

/**
 * `scripts/` tiene su propia frontera, con excepciones declaradas una a una.
 * Es el mismo trato que `tests/datos-frontera-controlador.test.ts` da a
 * `scripts/migrate.mjs` con el controlador de Neon: un script de terminal no
 * puede importar un módulo con `server-only`, así que se conecta por su cuenta.
 *
 * La prueba falla en dos direcciones: si aparece un script nuevo que importa
 * `firebase-admin` sin estar en la lista, y si uno de estos deja de importarlo
 * y nadie borra su entrada, para que la lista nunca mienta.
 */
const SCRIPTS_QUE_PUEDEN = [
  // Comprueba que ADC funciona antes de dar por buena la configuración local.
  // No puede pasar por app/identidad/firebase.server.ts, que lleva "server-only".
  "scripts/comprobar-adc.mjs",
  // Pregunta a Firebase qué identidades siguen existiendo y tampoco puede
  // importar el módulo con "server-only".
  "scripts/reconciliar-identidades.mjs",
  // Comprueba el camino entero de la identidad federada, desde el testigo de
  // Vercel hasta una llamada real a Firebase Authentication.
  "scripts/comprobar-federacion.mjs",
];

test("en scripts/, solo los declarados importan firebase-admin", () => {
  const encontrados = archivosDe(join(RAIZ, "scripts")).filter(usaFirebaseAdmin).map(aPosix);

  assert.deepEqual(
    [...encontrados].sort(),
    [...SCRIPTS_QUE_PUEDEN].sort(),
    `La lista de scripts autorizados ya no coincide con la realidad.\n` +
      `Importan firebase-admin:\n${encontrados.join("\n") || "(ninguno)"}\n\n` +
      `Declarados:\n${SCRIPTS_QUE_PUEDEN.join("\n") || "(ninguno)"}`,
  );
});

test("el barrido solo considera huérfano un usuario ausente en Firebase", () => {
  const ruta = join(RAIZ, "scripts", "reconciliar-identidades.mjs");
  assert.equal(existsSync(ruta), true, "Falta el script de reconciliación.");

  const fuente = readFileSync(ruta, "utf8");
  assert.match(fuente, /auth\/user-not-found/);
  assert.match(fuente, /throw error/);
});

test("la identidad de clientes no importa nada del panel, ni al revés", () => {
  const clientes = [
    ...archivosDe(join(RAIZ, "app", "identidad")),
    ...archivosDe(join(RAIZ, "app", "cuenta")),
  ];
  const invasores = clientes
    .filter((ruta) =>
      /from "[^"]*app\/admin|from "\.\.\/admin|from "\.\.\/\.\.\/admin/.test(readFileSync(ruta, "utf8")),
    )
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

/**
 * La política de la organización prohíbe generar claves de cuenta de servicio,
 * y el código no debe pedirlas por ninguna vía: ni `cert()`, ni una clave
 * privada en el entorno, ni un JSON de credenciales dentro del repositorio.
 */
test("no se usan claves privadas de cuenta de servicio", () => {
  const sospechosos = [...archivosDe(join(RAIZ, "app")), ...archivosDe(join(RAIZ, "scripts"))]
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      return (
        /from "firebase-admin[^"]*";?[\s\S]*\bcert\s*\(/.test(fuente) ||
        fuente.includes("FIREBASE_PRIVATE_KEY")
      );
    })
    .map(aPosix);

  assert.deepEqual(
    sospechosos,
    [],
    `La organización prohíbe las claves de cuenta de servicio: se usan credenciales ` +
      `predeterminadas (ADC). Archivos que las piden:\n${sospechosos.join("\n")}`,
  );
});

/**
 * Las bibliotecas de la federación entran por un solo archivo, igual que
 * `firebase-admin` entra por `firebase.server.ts` y el controlador de Neon por
 * `app/lib/datos`. Cuando la dependencia tiene una sola puerta, cambiarla o simularla es
 * un trabajo acotado.
 */
test("dentro de app/, solo credencialFederada.server.ts importa las bibliotecas de federacion", () => {
  const infractores = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      return /from "google-auth-library|from "@vercel\/oidc/.test(fuente);
    })
    .map(aPosix)
    .filter((ruta) => ruta !== "app/identidad/credencialFederada.server.ts");

  assert.deepEqual(
    infractores,
    [],
    `Solo app/identidad/credencialFederada.server.ts puede importarlas. Además lo hacen:\n${infractores.join("\n")}`,
  );
});

/**
 * Se mira el import, no la mención: el módulo explica en un comentario por qué NO importa
 * `firebase-admin`, y esa explicación tiene que poder escribirse.
 */
test("el modulo puro de la credencial no importa firebase-admin", () => {
  const ruta = join(RAIZ, "app", "identidad", "credencial.ts");
  assert.equal(existsSync(ruta), true, "Falta el módulo puro de la credencial.");
  assert.equal(
    usaFirebaseAdmin(ruta),
    false,
    "credencial.ts declara la forma de Credential por su cuenta; importarla rompería la frontera.",
  );
});

test("firebase.server.ts no tiene salida hacia ADC cuando esta en Vercel", () => {
  const fuente = readFileSync(join(RAIZ, "app", "identidad", "firebase.server.ts"), "utf8");
  assert.match(fuente, /elegirModo/, "La elección tiene que venir del módulo puro y probado.");
  assert.equal(
    /VERCEL[\s\S]{0,200}applicationDefault/.test(fuente),
    false,
    "En Vercel no puede haber ninguna caída hacia applicationDefault().",
  );
});

/**
 * El comprobador toca los tres testigos del camino federado. Ninguno puede acabar en la
 * consola: un testigo impreso es un testigo que se pega en un chat o queda en el historial
 * de la terminal.
 */
test("el comprobador de federacion no imprime ningun testigo", () => {
  const ruta = join(RAIZ, "scripts", "comprobar-federacion.mjs");
  assert.equal(existsSync(ruta), true, "Falta el script de comprobación de la federación.");

  const fuente = readFileSync(ruta, "utf8");

  for (const prohibido of [
    /console\.log\([^)]*\btoken\b/i,
    /console\.log\([^)]*access_token/i,
    /console\.log\([^)]*getSubjectToken/i,
  ]) {
    assert.equal(prohibido.test(fuente), false, `El script no puede imprimir testigos: ${prohibido}`);
  }

  assert.match(fuente, /expires_in|segundos/, "Sí debe informar de cuánto vive la credencial.");
});

/**
 * Obtener un testigo prueba que hay identidad; no prueba que tenga permiso. La
 * comprobación tiene que llegar hasta Firebase Authentication, igual que hace
 * `scripts/comprobar-adc.mjs`, o dará por buena una configuración a la que le falta el rol.
 */
test("comprobarCredenciales no se conforma con obtener un testigo", () => {
  const fuente = readFileSync(join(RAIZ, "app", "identidad", "firebase.server.ts"), "utf8");
  const cuerpo = fuente.slice(fuente.indexOf("export async function comprobarCredenciales"));

  assert.match(
    cuerpo,
    /listUsers/,
    "Tener un testigo no es tener permiso: hay que ejercitar Firebase Authentication de verdad.",
  );
});

test("las bibliotecas de federacion son dependencias directas, no transitivas", () => {
  const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  assert.ok(
    paquete.dependencies["google-auth-library"],
    "google-auth-library se importa explícitamente: no puede depender de que la traiga firebase-admin.",
  );
  assert.ok(
    paquete.dependencies["@vercel/oidc"],
    "@vercel/oidc se importa explícitamente: no puede depender de que la traiga @vercel/blob.",
  );
});
