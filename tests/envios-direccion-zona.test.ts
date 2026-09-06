// tests/envios-direccion-zona.test.ts
//
// La zona capitalina es obligatoria cuando el municipio es Guatemala, y prohibida
// cuando no lo es. La restricción de la migración 015 impone lo segundo en la
// base; lo primero lo impone la aplicación, porque las direcciones históricas no
// tienen zona y no se pueden invalidar retroactivamente.
import test from "node:test";
import assert from "node:assert/strict";
import { validarDireccion } from "../app/identidad/direcciones";

const BASE_CAPITAL = {
  destinatario: "Juan Perez",
  telefono: "12345678",
  departamento: "Guatemala",
  municipio: "Guatemala",
  departamentoCodigo: "01",
  municipioCodigo: "0101",
  direccion: "7a Avenida",
};

test("municipio de Guatemala exige zona capitalina válida", () => {
  const sinZona = validarDireccion({ ...BASE_CAPITAL, zonaCapitalina: null });
  assert.equal(sinZona.ok, false);
  if (!sinZona.ok) {
    assert.ok(sinZona.faltan.includes("zonaCapitalina"));
  }

  const zonaInvalida = validarDireccion({ ...BASE_CAPITAL, zonaCapitalina: 20 });
  assert.equal(zonaInvalida.ok, false);

  const conZonaValida = validarDireccion({ ...BASE_CAPITAL, zonaCapitalina: 10 });
  assert.equal(conZonaValida.ok, true);
  if (conZonaValida.ok) {
    assert.equal(conZonaValida.direccion.zonaCapitalina, 10);
  }
});

test("la zona llega del formulario como texto y se acepta igual", () => {
  const desdeFormData = validarDireccion({ ...BASE_CAPITAL, zonaCapitalina: "14" });
  assert.equal(desdeFormData.ok, true);
  if (desdeFormData.ok) {
    assert.equal(desdeFormData.direccion.zonaCapitalina, 14);
  }
});

test("una zona con decimales o texto libre no cuela", () => {
  for (const zona of ["10.5", "zona 10", "", "  ", true, 10.5]) {
    const r = validarDireccion({ ...BASE_CAPITAL, zonaCapitalina: zona });
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(zona)}`);
  }
});

test("municipio fuera de Guatemala limpia zona_capitalina a null", () => {
  const fuera = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Mixco",
    departamentoCodigo: "01",
    municipioCodigo: "0108",
    direccion: "Calzada Roosevelt",
    zonaCapitalina: 4,
  });
  assert.equal(fuera.ok, true);
  if (fuera.ok) {
    assert.equal(fuera.direccion.zonaCapitalina, null);
  }
});

test("sin códigos oficiales no se exige zona y no se guarda ninguna", () => {
  const sinCodigos = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    direccion: "7a Avenida",
    zonaCapitalina: 10,
  });
  assert.equal(sinCodigos.ok, true);
  if (sinCodigos.ok) {
    assert.equal(sinCodigos.direccion.departamentoCodigo, null);
    assert.equal(sinCodigos.direccion.zonaCapitalina, null);
  }
});

test("el mensaje de campos que faltan nombra la zona capitalina en castellano", async () => {
  const { mensajeDeFaltan } = await import("../app/identidad/direcciones");
  const mensaje = mensajeDeFaltan(["zonaCapitalina"]);
  assert.match(mensaje, /zona capitalina/i);
  assert.equal(mensaje.includes("zonaCapitalina"), false);
});

test("las SQL de direcciones incluyen la zona capitalina", async () => {
  const { SQL_INSERTAR_DIRECCION, SQL_LISTAR_DIRECCIONES } = await import(
    "../app/identidad/direcciones"
  );
  assert.match(SQL_LISTAR_DIRECCIONES, /zona_capitalina/);
  assert.match(SQL_INSERTAR_DIRECCION, /zona_capitalina/);
  // Once columnas, once marcadores de posición.
  assert.match(SQL_INSERTAR_DIRECCION, /\$11/);
  assert.equal(SQL_INSERTAR_DIRECCION.includes("$12"), false);
});
