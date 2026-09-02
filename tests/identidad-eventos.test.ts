import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAXIMO_DE_FALLOS,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
  politicaDeLimite,
} from "../app/identidad/eventos";

const BASE = {
  userId: "7",
  tipo: "acceso" as const,
  proveedor: "google.com",
  resultado: "correcto" as const,
  ip: "190.56.100.25",
  userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36",
  pimienta: "pimienta-de-prueba",
};

test("la IP no viaja a la base: viaja su huella", () => {
  const parametros = parametrosDeEvento(BASE);
  assert.equal(parametros.includes("190.56.100.25"), false);
  assert.match(String(parametros[4]), /^[0-9a-f]{32}$/);
});

test("del navegador solo va la familia", () => {
  assert.equal(parametrosDeEvento(BASE)[5], "Chrome en Android");
});

test("un evento sin usuario conocido se guarda igual", () => {
  const parametros = parametrosDeEvento({
    ...BASE,
    userId: null,
    tipo: "fallo",
    resultado: "fallido",
  });
  assert.equal(parametros[0], null);
  assert.equal(parametros[1], "fallo");
  assert.equal(parametros[3], "fallido");
});

test("sin pimienta no se guarda huella, y el evento no se pierde por eso", () => {
  const parametros = parametrosDeEvento({ ...BASE, pimienta: undefined });
  assert.equal(parametros[4], null);
  assert.equal(parametros[1], "acceso");
});

test("la sentencia escribe en auth_events y no en otra tabla", () => {
  assert.match(SQL_REGISTRAR_EVENTO, /insert into auth_events/);
});

test("se cuentan los fallos por huella y dentro de una ventana de tiempo", () => {
  assert.match(SQL_CONTAR_FALLOS, /ip_huella = \$1/);
  assert.match(SQL_CONTAR_FALLOS, /resultado = 'fallido'/);
  assert.match(SQL_CONTAR_FALLOS, /ocurrido_en/);
});

test("por debajo del límite no se frena a nadie", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS - 1 }]), false);
});

test("alcanzado el límite, sí", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS }]), true);
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS + 10 }]), true);
});

test("sin datos no se bloquea: no saber no autoriza a frenar", () => {
  assert.equal(hayDemasiadosFallos([]), false);
});

/**
 * El límite de intentos se apagaba solo, y en silencio, cuando faltaba
 * `AUTH_EVENT_IP_PEPPER`: sin pimienta no hay huella, sin huella no hay nada que contar, y
 * la función devolvía «adelante». Una variable de entorno sin poner dejaba el acceso de
 * clientes sin ninguna protección contra fuerza bruta y nadie se enteraba.
 *
 * La regla ahora es la misma que ya aplica el proyecto con `ADMIN_SESSION_SECRET` —«sin
 * esta variable el panel no arranca, a propósito»— y con `origenPublico`: **en producción
 * se falla cerrado y ruidoso**; en local se permite, con aviso, para no dejar el
 * desarrollo inservible.
 */
test("en produccion, sin pimienta, se bloquea en vez de dejar pasar", () => {
  const politica = politicaDeLimite({ hayPimienta: false, hayIp: true, produccion: true });

  assert.equal(politica.accion, "bloquear");
  assert.match(politica.suceso, /pimienta/);
});

test("en produccion, sin pimienta, NUNCA se permite", () => {
  for (const hayIp of [true, false]) {
    const politica = politicaDeLimite({ hayPimienta: false, hayIp, produccion: true });
    assert.notEqual(
      politica.accion,
      "permitir",
      "Sin pimienta en producción no puede permitirse el intento bajo ninguna circunstancia.",
    );
  }
});

test("en desarrollo, sin pimienta, se permite pero queda dicho", () => {
  const politica = politicaDeLimite({ hayPimienta: false, hayIp: true, produccion: false });

  assert.equal(politica.accion, "permitir");
  assert.equal(politica.nivel, "info");
  assert.match(politica.suceso, /pimienta/);
});

test("con pimienta y con IP se comprueba el limite de verdad", () => {
  assert.deepEqual(politicaDeLimite({ hayPimienta: true, hayIp: true, produccion: true }), {
    accion: "comprobar",
  });
});

/**
 * Sin IP tampoco se puede contar por huella. No se bloquea —dejaría fuera a quien entra de
 * buena fe si un día faltara la cabecera—, pero en producción tiene que quedar registrado
 * como error, que es lo que distingue «no protege» de «no protege y nadie lo sabe».
 */
test("con pimienta pero sin IP se permite, y en produccion se registra como error", () => {
  const enProduccion = politicaDeLimite({ hayPimienta: true, hayIp: false, produccion: true });
  assert.equal(enProduccion.accion, "permitir");
  assert.equal(enProduccion.nivel, "error");

  const enLocal = politicaDeLimite({ hayPimienta: true, hayIp: false, produccion: false });
  assert.equal(enLocal.accion, "permitir");
  assert.equal(enLocal.nivel, "info");
});

test("ninguna decision se toma en silencio: todas llevan suceso que registrar", () => {
  const combinaciones = [true, false].flatMap((hayPimienta) =>
    [true, false].flatMap((hayIp) =>
      [true, false].map((produccion) => ({ hayPimienta, hayIp, produccion })),
    ),
  );

  for (const entrada of combinaciones) {
    const politica = politicaDeLimite(entrada);
    if (politica.accion === "comprobar") continue;
    assert.ok(
      politica.suceso.length > 0,
      `Sin suceso que registrar, el fallo de configuración sería invisible: ${JSON.stringify(entrada)}`,
    );
  }
});
