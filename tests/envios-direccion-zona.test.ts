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

test("una dirección nueva sin códigos oficiales se rechaza", () => {
  // Antes se aceptaba degradando los códigos a `null`, y esa puerta permitía
  // exactamente lo que la zona capitalina quiere impedir: guardar
  // «Guatemala/Guatemala» como texto libre, sin zona y sin códigos, y quedarse
  // con una dirección que después no se puede enviar ni calcular.
  const sinCodigos = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    direccion: "7a Avenida",
    zonaCapitalina: 10,
  });
  assert.equal(sinCodigos.ok, false);
  if (!sinCodigos.ok) {
    assert.ok(
      sinCodigos.faltan.includes("departamento") || sinCodigos.faltan.includes("municipio"),
      `faltan: ${sinCodigos.faltan.join(", ")}`,
    );
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

// ---------------------------------------------------------------------------
// La frontera del servidor no se fía del formulario
//
// Todo lo que llega en el `FormData` lo escribe el navegador, y el navegador es
// del visitante. Comprobar solo la forma —dos dígitos y cuatro dígitos— deja
// pasar códigos que no existen y parejas que no se corresponden, y eso importa
// más desde que la zona capitalina decide el precio del envío: bastaría con
// enviar 01/0101 a mano para que una dirección de Petén se cobrara como
// capitalina, a Q35 con mensajero propio.
// ---------------------------------------------------------------------------

test("un municipio con formato válido pero inexistente se rechaza", () => {
  const r = validarDireccion({
    destinatario: "Codigo Inventado",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0199", // cuatro dígitos, pero no existe en el catálogo INE
    direccion: "Calle falsa",
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.faltan.includes("municipio"), `faltan: ${r.faltan.join(", ")}`);
  }
});

test("un departamento con formato válido pero inexistente se rechaza", () => {
  const r = validarDireccion({
    destinatario: "Departamento Inventado",
    telefono: "12345678",
    departamento: "Atlantida",
    municipio: "Cualquiera",
    departamentoCodigo: "99",
    municipioCodigo: "9901",
    direccion: "Calle falsa",
  });
  assert.equal(r.ok, false);
});

test("un municipio real de otro departamento se rechaza", () => {
  // 0901 es Quetzaltenango, que no pertenece al departamento 01 (Guatemala).
  const r = validarDireccion({
    destinatario: "Pareja Incompatible",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Quetzaltenango",
    departamentoCodigo: "01",
    municipioCodigo: "0901",
    direccion: "Calle falsa",
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.faltan.includes("municipio"), `faltan: ${r.faltan.join(", ")}`);
  }
});

test("los nombres que se guardan salen del catálogo, no del formulario", () => {
  // El navegador manda nombres manipulados junto a códigos correctos. Lo que se
  // persiste tiene que ser lo que dice el catálogo.
  const r = validarDireccion({
    destinatario: "Nombres Manipulados",
    telefono: "12345678",
    departamento: "Departamento Inventado S.A.",
    municipio: "Municipio de Mentira",
    departamentoCodigo: "01",
    municipioCodigo: "0108",
    direccion: "Km 15 Calzada Roosevelt",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.direccion.departamento, "Guatemala");
    assert.equal(r.direccion.municipio, "Mixco");
  }
});

test("solo 01/0101 admite zona capitalina, aunque el formulario insista", () => {
  // Mixco es un municipio real del mismo departamento, y aun así no lleva zona.
  const mixco = validarDireccion({
    destinatario: "Mixco Con Zona",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Mixco",
    departamentoCodigo: "01",
    municipioCodigo: "0108",
    direccion: "Calzada Roosevelt",
    zonaCapitalina: 10,
  });
  assert.equal(mixco.ok, true);
  if (mixco.ok) {
    assert.equal(mixco.direccion.zonaCapitalina, null);
  }

  const capital = validarDireccion({
    destinatario: "Capital Con Zona",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    direccion: "7a Avenida",
    zonaCapitalina: 10,
  });
  assert.equal(capital.ok, true);
  if (capital.ok) {
    assert.equal(capital.direccion.zonaCapitalina, 10);
  }
});

test("un envío manual que finge ser capitalino con un municipio ajeno no cuela", () => {
  // El ataque que importa: 01/0101 daría mensajero propio a Q35. Aquí se envía
  // el par correcto pero con un municipio de otro departamento en los códigos.
  const r = validarDireccion({
    destinatario: "Peten Disfrazado",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "17", // Petén
    municipioCodigo: "0101", // pero el municipio es el de la capital
    direccion: "Flores",
    zonaCapitalina: 10,
  });
  assert.equal(r.ok, false);
});

test("una dirección legítima del interior sigue guardándose", () => {
  const r = validarDireccion({
    destinatario: "Cliente Del Interior",
    telefono: "12345678",
    departamento: "Quetzaltenango",
    municipio: "Quetzaltenango",
    departamentoCodigo: "09",
    municipioCodigo: "0901",
    direccion: "4a Calle",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.direccion.departamento, "Quetzaltenango");
    assert.equal(r.direccion.municipio, "Quetzaltenango");
    assert.equal(r.direccion.zonaCapitalina, null);
  }
});

// ---------------------------------------------------------------------------
// Los códigos son obligatorios en toda dirección nueva
//
// Dejarlos opcionales abría un rodeo: omitirlos evitaba la comprobación contra el
// catálogo y, con ella, la obligatoriedad de la zona capitalina. La dirección se
// guardaba como texto libre y el envío después no se podía calcular.
//
// Las direcciones históricas sin códigos siguen leyéndose sin problema: la
// obligatoriedad es para lo que entra, no para lo que ya está guardado.
// ---------------------------------------------------------------------------

const SIN_CODIGOS = {
  destinatario: "Sin Codigos",
  telefono: "12345678",
  departamento: "Guatemala",
  municipio: "Guatemala",
  direccion: "7a Avenida 1-00",
};

test("faltan los dos códigos", () => {
  const r = validarDireccion(SIN_CODIGOS);
  assert.equal(r.ok, false);
});

test("solo llega el departamento", () => {
  const r = validarDireccion({ ...SIN_CODIGOS, departamentoCodigo: "01" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.faltan.includes("municipio"), `faltan: ${r.faltan.join(", ")}`);
  }
});

test("solo llega el municipio", () => {
  const r = validarDireccion({ ...SIN_CODIGOS, municipioCodigo: "0101" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.faltan.includes("departamento"), `faltan: ${r.faltan.join(", ")}`);
  }
});

test("los códigos malformados se rechazan en vez de convertirse en null", () => {
  for (const [dep, mun] of [
    ["1", "abc"],
    ["001", "0101"],
    ["01", "101"],
    ["ab", "cdef"],
    ["01", "01011"],
    [" 01", "0101"],
  ]) {
    const r = validarDireccion({ ...SIN_CODIGOS, departamentoCodigo: dep, municipioCodigo: mun });
    assert.equal(r.ok, false, `debería rechazar ${dep}/${mun}`);
  }
});

test("omitir los códigos ya no sirve para guardar «Guatemala/Guatemala» sin zona", () => {
  // Este era el rodeo concreto: sin códigos no se pedía zona, y la dirección de
  // la capital entraba igual.
  const r = validarDireccion({
    destinatario: "Rodeo De La Zona",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    direccion: "7a Avenida",
  });
  assert.equal(r.ok, false);

  // Y con los códigos puestos, la zona vuelve a ser obligatoria.
  const conCodigos = validarDireccion({
    destinatario: "Rodeo De La Zona",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    direccion: "7a Avenida",
  });
  assert.equal(conCodigos.ok, false);
  if (!conCodigos.ok) {
    assert.ok(conCodigos.faltan.includes("zonaCapitalina"));
  }
});

test("una dirección oficial completa se acepta y se normaliza", () => {
  const r = validarDireccion({
    destinatario: "Direccion Oficial",
    telefono: "12345678",
    departamento: "lo que escriba el navegador",
    municipio: "lo que escriba el navegador",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    zonaCapitalina: 15,
    direccion: "21 Avenida 0-18, Vista Hermosa 2",
    referencias: "Portón negro",
    predeterminada: true,
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.direccion.departamentoCodigo, "01");
    assert.equal(r.direccion.municipioCodigo, "0101");
    assert.equal(r.direccion.departamento, "Guatemala");
    assert.equal(r.direccion.municipio, "Guatemala");
    assert.equal(r.direccion.zonaCapitalina, 15);
    assert.equal(r.direccion.predeterminada, true);
  }
});
