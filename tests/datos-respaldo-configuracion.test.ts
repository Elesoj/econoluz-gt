import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decidirOrigenPublico,
  servirCatalogoPublico,
  type DecisionDeOrigen,
} from "../app/data/origenPublico";

test("en producción sin cadena pública se sirve el respaldo estático", () => {
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });
  assert.equal(decision.origen, "respaldo-estatico");
  assert.equal(decision.registrarErrorDeConfiguracion, true);
});

test("en producción sin cadena pública NUNCA se usa la privilegiada", () => {
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });
  assert.notEqual(decision.origen, "conexion-privilegiada");
});

test("en local sin cadena pública se permite la privilegiada, con aviso", () => {
  const decision = decidirOrigenPublico({ produccion: false, hayCadenaPublica: false });
  assert.equal(decision.origen, "conexion-privilegiada");
  assert.equal(decision.avisar, true);
});

test("con cadena pública se usa el rol público en cualquier entorno", () => {
  for (const produccion of [true, false]) {
    assert.equal(
      decidirOrigenPublico({ produccion, hayCadenaPublica: true }).origen,
      "rol-publico",
    );
  }
});

test("el rol público no avisa ni registra error: es la configuración correcta", () => {
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: true });
  assert.equal(decision.avisar, false);
  assert.equal(decision.registrarErrorDeConfiguracion, false);
});

// Saber que la decisión dice «respaldo-estatico» no demuestra que nadie llame a
// la conexión privilegiada. Estas pruebas espían las cuatro fuentes y comprueban
// cuál se usó de verdad.

type Espias = {
  fuentes: Parameters<typeof servirCatalogoPublico<string>>[1];
  llamadas: string[];
  registro: string[];
};

function espiar(): Espias {
  const llamadas: string[] = [];
  const registro: string[] = [];

  return {
    llamadas,
    registro,
    fuentes: {
      desdeRolPublico: async () => {
        llamadas.push("rol-publico");
        return "catálogo del rol público";
      },
      desdeConexionPrivilegiada: async () => {
        llamadas.push("conexion-privilegiada");
        return "catálogo con la conexión privilegiada";
      },
      catalogoEstatico: () => {
        llamadas.push("respaldo-estatico");
        return "catálogo escrito en el código";
      },
      registrar: (nivel, suceso) => registro.push(`${nivel}:${suceso}`),
    },
  };
}

test("en producción sin cadena pública no se llega a tocar la conexión privilegiada", async () => {
  const espias = espiar();
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });

  const catalogo = await servirCatalogoPublico(decision, espias.fuentes);

  assert.equal(catalogo, "catálogo escrito en el código");
  assert.deepEqual(espias.llamadas, ["respaldo-estatico"]);
  assert.equal(espias.llamadas.includes("conexion-privilegiada"), false);
});

test("en producción sin cadena pública queda registrado un error de configuración", async () => {
  const espias = espiar();
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });

  await servirCatalogoPublico(decision, espias.fuentes);

  assert.deepEqual(espias.registro, ["error:catalogo-publico-sin-cadena-publica"]);
});

test("con cadena pública se lee por el rol público y no se registra nada", async () => {
  const espias = espiar();
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: true });

  const catalogo = await servirCatalogoPublico(decision, espias.fuentes);

  assert.equal(catalogo, "catálogo del rol público");
  assert.deepEqual(espias.llamadas, ["rol-publico"]);
  assert.deepEqual(espias.registro, []);
});

test("en desarrollo sin cadena pública se usa la privilegiada y se avisa", async () => {
  const espias = espiar();
  const decision = decidirOrigenPublico({ produccion: false, hayCadenaPublica: false });

  const catalogo = await servirCatalogoPublico(decision, espias.fuentes);

  assert.equal(catalogo, "catálogo con la conexión privilegiada");
  assert.deepEqual(espias.llamadas, ["conexion-privilegiada"]);
  assert.deepEqual(espias.registro, ["info:catalogo-publico-con-conexion-privilegiada"]);
});

// Si el rol público falla teniéndolo configurado, eso es una avería, no un
// descuido de configuración: no autoriza a probar la conexión privilegiada.
test("un fallo del rol público no abre la puerta a la privilegiada", async () => {
  const espias = espiar();
  const decision: DecisionDeOrigen = {
    origen: "rol-publico",
    avisar: false,
    registrarErrorDeConfiguracion: false,
  };

  await assert.rejects(
    servirCatalogoPublico(decision, {
      ...espias.fuentes,
      desdeRolPublico: async () => {
        espias.llamadas.push("rol-publico");
        throw new Error("el rol público no contesta");
      },
    }),
  );

  assert.deepEqual(espias.llamadas, ["rol-publico"]);
});

// ---------------------------------------------------------------------------
// La garantía estructural: la capa no puede degradar de público a privilegiado.
//
// `app/lib/datos/conexion.ts` e `index.ts` empiezan con `import "server-only"`,
// que no se resuelve fuera del empaquetador de Next, así que no se pueden
// importar desde aquí y la comprobación se hace sobre el texto. Es el mismo
// recurso que usa `tests/datos-frontera-controlador.test.ts`.
//
// Para que no pase en falso, cada comprobación empieza exigiendo que la función
// exista: si alguien la renombra, la prueba falla en vez de quedarse sin nada
// que mirar.

const CAPA = join(import.meta.dirname, "..", "app", "lib", "datos");
const LECTOR_PUBLICO = join(
  import.meta.dirname,
  "..",
  "app",
  "data",
  "catalogo",
  "lecturaPublica.server.ts",
);

test("el lector relacional público vive en una frontera sin acceso privilegiado", () => {
  assert.equal(
    existsSync(LECTOR_PUBLICO),
    true,
    "La lectura pública debe vivir separada del adaptador relacional privado.",
  );
  const fuente = readFileSync(LECTOR_PUBLICO, "utf8");
  assert.match(fuente, /import \{ leerPublico, type Ejecutor \} from "\.\.\/\.\.\/lib\/datos"/);
  assert.doesNotMatch(
    fuente,
    /import \{[^}]*\bleer\b[^}]*\} from "\.\.\/\.\.\/lib\/datos"/,
    "La frontera pública no puede importar el lector privilegiado.",
  );
  assert.doesNotMatch(
    fuente,
    /DATABASE_URL(?!_PUBLIC)/,
    "La frontera pública no puede consultar la cadena privilegiada.",
  );
});

/**
 * Devuelve el cuerpo de una función exportada.
 *
 * No vale con buscar la primera llave después del nombre: la firma puede llevar
 * un tipo con llaves —`opciones?: { msMaximo?: number }`— y entonces se
 * devolvería ese tipo en lugar del cuerpo. Primero se cierra la lista de
 * parámetros contando paréntesis, y solo después se busca la llave.
 */
function cuerpoDeFuncion(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`export function ${nombre}`);
  assert.notEqual(inicio, -1, `No existe la función ${nombre}; ¿la han renombrado?`);

  let parentesis = 0;
  let finDeParametros = -1;

  for (let i = fuente.indexOf("(", inicio); i < fuente.length; i += 1) {
    if (fuente[i] === "(") parentesis += 1;
    if (fuente[i] === ")") {
      parentesis -= 1;
      if (parentesis === 0) {
        finDeParametros = i;
        break;
      }
    }
  }

  assert.notEqual(finDeParametros, -1, `No se pudo leer la firma de ${nombre}.`);

  const primeraLlave = fuente.indexOf("{", finDeParametros);
  let nivel = 0;

  for (let i = primeraLlave; i < fuente.length; i += 1) {
    if (fuente[i] === "{") nivel += 1;
    if (fuente[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fuente.slice(primeraLlave, i + 1);
    }
  }

  throw new Error(`No se pudo delimitar el cuerpo de ${nombre}.`);
}

test("el ejecutor público solo mira DATABASE_URL_PUBLIC", () => {
  const cuerpo = cuerpoDeFuncion(
    readFileSync(join(CAPA, "conexion.ts"), "utf8"),
    "ejecutorPublico",
  );

  assert.match(cuerpo, /DATABASE_URL_PUBLIC/);
  assert.equal(
    /DATABASE_URL(?!_PUBLIC)/.test(cuerpo),
    false,
    "El ejecutor público no puede caer a la conexión privilegiada: ese respaldo " +
      "quitaría la barrera sin que nadie se entere.",
  );
});

test("leerPublico devuelve null en vez de recurrir a la conexión privilegiada", () => {
  const cuerpo = cuerpoDeFuncion(readFileSync(join(CAPA, "index.ts"), "utf8"), "leerPublico");

  assert.match(cuerpo, /ejecutorPublico/);
  assert.match(cuerpo, /null/);
  assert.equal(
    cuerpo.includes("ejecutorDeLectura"),
    false,
    "`leerPublico` no puede usar el ejecutor privilegiado como respaldo.",
  );
});
