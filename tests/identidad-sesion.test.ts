import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COOKIE_SESION_CLIENTE,
  MS_DE_SESION,
  caducidadDesde,
  cerrarSesion,
  debeRenovarSesion,
  debeRenovarse,
  normalizarCorreo,
  opcionesDeCookie,
} from "../app/identidad/sesion";

test("la cookie del cliente no se llama como la del panel", () => {
  assert.notEqual(COOKIE_SESION_CLIENTE, "econoluz_admin");
  assert.match(COOKIE_SESION_CLIENTE, /cliente/);
});

test("el correo se normaliza a minúsculas y sin espacios", () => {
  assert.equal(normalizarCorreo("  Persona@Example.COM "), "persona@example.com");
  assert.equal(normalizarCorreo(""), "");
  assert.equal(normalizarCorreo(null), "");
  assert.equal(normalizarCorreo(42), "");
});

test("la sesión dura cinco días", () => {
  assert.equal(MS_DE_SESION, 5 * 24 * 60 * 60 * 1000);
  const ahora = new Date("2026-09-01T00:00:00.000Z");
  assert.equal(caducidadDesde(ahora).toISOString(), "2026-09-06T00:00:00.000Z");
});

test("la cookie es httpOnly, laxa y con ámbito de todo el sitio", () => {
  const opciones = opcionesDeCookie(new Date("2026-09-06T00:00:00.000Z"), true);
  assert.equal(opciones.httpOnly, true);
  assert.equal(opciones.sameSite, "lax");
  assert.equal(opciones.secure, true);
  assert.equal(opciones.path, "/");
});

test("fuera de producción la cookie no exige https, o no habría desarrollo local", () => {
  assert.equal(opcionesDeCookie(new Date(), false).secure, false);
});

test("se renueva cuando ha pasado más de la mitad de su vida", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(debeRenovarse(new Date("2026-09-07T00:00:00.000Z"), ahora), false);
  assert.equal(debeRenovarse(new Date("2026-09-04T00:00:00.000Z"), ahora), true);
});

test("una sesión ya caducada no se renueva: se rehace entrando", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(debeRenovarse(new Date("2026-09-01T00:00:00.000Z"), ahora), false);
});

/**
 * Cerrar sesión solo borraba la cookie del navegador. La cookie de sesión de Firebase
 * seguía siendo válida hasta caducar, así que un cierre de sesión no protegía frente a una
 * cookie ya capturada. `verificarCookieDeSesion` ya comprueba la revocación, de modo que
 * revocar al salir la invalida de verdad.
 */
test("cerrar sesion revoca en Firebase antes de borrar la cookie", async () => {
  const orden: string[] = [];

  const resultado = await cerrarSesion({
    uid: "uid-de-firebase",
    revocar: async (uid) => {
      assert.equal(uid, "uid-de-firebase");
      orden.push("revocar");
    },
    borrarCookie: async () => {
      orden.push("borrar-cookie");
    },
  });

  assert.deepEqual(orden, ["revocar", "borrar-cookie"]);
  assert.equal(resultado.revocada, true);
});

/**
 * Si Firebase no contesta, el visitante tiene que poder salir igualmente: dejarle dentro
 * sería peor que no haber revocado.
 */
test("si la revocacion falla, la cookie se borra igual", async () => {
  let cookieBorrada = false;

  const resultado = await cerrarSesion({
    uid: "uid-de-firebase",
    revocar: async () => {
      throw new Error("Firebase no responde");
    },
    borrarCookie: async () => {
      cookieBorrada = true;
    },
  });

  assert.equal(cookieBorrada, true);
  assert.equal(resultado.revocada, false);
});

test("sin sesion que cerrar, no se llama a Firebase pero la cookie se borra", async () => {
  let seRevoco = false;
  let cookieBorrada = false;

  const resultado = await cerrarSesion({
    uid: null,
    revocar: async () => {
      seRevoco = true;
    },
    borrarCookie: async () => {
      cookieBorrada = true;
    },
  });

  assert.equal(seRevoco, false, "Sin uid no hay a quién revocar.");
  assert.equal(cookieBorrada, true);
  assert.equal(resultado.revocada, false);
});

/**
 * `debeRenovarse` estaba escrita y probada pero no la llamaba nadie: la sesión caducaba en
 * seco a los cinco días, al contrario de lo que decía su propio comentario. Esto es la
 * decisión completa, con los casos que no pueden dispararla.
 */
const AHORA = new Date("2026-09-02T12:00:00Z");
const enSegundos = (fecha: Date) => Math.floor(fecha.getTime() / 1000);

test("pasada la mitad de la vida, la sesion valida se renueva", () => {
  const quedaUnDia = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);

  assert.equal(
    debeRenovarSesion({ valida: true, expiraEnSegundos: enSegundos(quedaUnDia), ahora: AHORA }),
    true,
  );
});

test("recien abierta no se renueva: renovar en cada carga no es renovar", () => {
  const quedanCuatroDias = new Date(AHORA.getTime() + 4 * 24 * 60 * 60 * 1000);

  assert.equal(
    debeRenovarSesion({
      valida: true,
      expiraEnSegundos: enSegundos(quedanCuatroDias),
      ahora: AHORA,
    }),
    false,
  );
});

/**
 * Renovar una sesión que no es válida sería alargar indefinidamente algo que ya debería
 * haber terminado. Se rehace entrando, no se prolonga.
 */
test("una sesion invalida no se renueva nunca", () => {
  const quedaUnDia = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);

  assert.equal(
    debeRenovarSesion({ valida: false, expiraEnSegundos: enSegundos(quedaUnDia), ahora: AHORA }),
    false,
  );
});

test("una sesion ya caducada no se renueva", () => {
  const caduco = new Date(AHORA.getTime() - 1000);

  assert.equal(
    debeRenovarSesion({ valida: true, expiraEnSegundos: enSegundos(caduco), ahora: AHORA }),
    false,
  );
});

test("sin caducidad conocida no se renueva, en vez de adivinarla", () => {
  assert.equal(debeRenovarSesion({ valida: true, expiraEnSegundos: null, ahora: AHORA }), false);
});
