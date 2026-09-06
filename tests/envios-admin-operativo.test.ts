// tests/envios-admin-operativo.test.ts
//
// La validación de los formularios del panel vive en un módulo puro, sin la
// directiva "use server", precisamente para poder probarla aquí sin levantar el
// entorno de Server Actions. Nada de lo que llega en el `FormData` se acepta sin
// comprobar: el navegador puede mandar cualquier cosa.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validarFormularioMetodoZona,
  validarFormularioRecogida,
  validarFormularioReglasEnvio,
} from "../app/admin/envios/formularios";

test("validarFormularioMetodoZona rechaza zonas inexistentes (20, 22, 23)", () => {
  for (const zonaInvalida of [20, 22, 23, 0, 26, -1]) {
    const fd = new FormData();
    fd.set("zona", String(zonaInvalida));
    fd.set("metodo", "mensajero_propio");
    const r = validarFormularioMetodoZona(fd);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /zona.*no es válida/i);
    }
  }
});

test("validarFormularioMetodoZona rechaza una zona con decimales o texto libre", () => {
  for (const bruta of ["10.5", "zona 10", "", "diez"]) {
    const fd = new FormData();
    fd.set("zona", bruta);
    fd.set("metodo", "guatex");
    assert.equal(validarFormularioMetodoZona(fd).ok, false, `debería rechazar «${bruta}»`);
  }
});

test("validarFormularioMetodoZona rechaza métodos no permitidos", () => {
  const fd = new FormData();
  fd.set("zona", "10");
  fd.set("metodo", "dron");
  const r = validarFormularioMetodoZona(fd);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /método.*no está permitido/i);
  }
});

test("validarFormularioMetodoZona acepta pares válidos", () => {
  const fd1 = new FormData();
  fd1.set("zona", "6");
  fd1.set("metodo", "guatex");
  const r1 = validarFormularioMetodoZona(fd1);
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.zona, 6);
    assert.equal(r1.metodo, "guatex");
  }

  const fd2 = new FormData();
  fd2.set("zona", "10");
  fd2.set("metodo", "mensajero_propio");
  const r2 = validarFormularioMetodoZona(fd2);
  assert.equal(r2.ok, true);
  if (r2.ok) {
    assert.equal(r2.zona, 10);
    assert.equal(r2.metodo, "mensajero_propio");
  }
});

// ---------------------------------------------------------------------------
// Los importes se piden en quetzales, nunca en centavos
//
// Quien administra escribe 35.00 y 2500.00, como se escribe cualquier cantidad
// de dinero. La conversión a los enteros que guarda `app_settings` ocurre aquí,
// en la frontera del servidor: por dentro se sigue sumando en centavos.
// ---------------------------------------------------------------------------

function reglas(tarifa: string, umbral: string): FormData {
  const fd = new FormData();
  fd.set("tarifaQuetzales", tarifa);
  fd.set("umbralGratisQuetzales", umbral);
  return fd;
}

test("Q35.00 se guarda como 3500 centavos", () => {
  const r = validarFormularioReglasEnvio(reglas("35.00", "2500.00"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.tarifaCents, 3500);
  }
});

test("Q2500.00 se guarda como 250000 centavos", () => {
  const r = validarFormularioReglasEnvio(reglas("35.00", "2500.00"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.umbralGratisCents, 250000);
  }
});

test("se admiten cero, uno y dos decimales", () => {
  const casos: Array<[string, number]> = [
    ["35", 3500],
    ["35.", 3500],
    ["35.5", 3550],
    ["35.50", 3550],
    ["0", 0],
    ["0.05", 5],
    ["2500", 250000],
  ];
  for (const [escrito, esperado] of casos) {
    const r = validarFormularioReglasEnvio(reglas(escrito, "2500"));
    assert.equal(r.ok, true, `debería aceptar «${escrito}»`);
    if (r.ok) {
      assert.equal(r.reglas.tarifaCents, esperado, `«${escrito}» debería dar ${esperado}`);
    }
  }
});

test("se admiten separadores de millar tal como los escribe una persona", () => {
  const r = validarFormularioReglasEnvio(reglas("35.00", "2,500.00"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.umbralGratisCents, 250000);
  }
});

test("más de dos decimales se rechaza: no hay medio centavo", () => {
  const r = validarFormularioReglasEnvio(reglas("35.005", "2500"));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /decimales/i);
  }
});

test("los negativos se rechazan", () => {
  assert.equal(validarFormularioReglasEnvio(reglas("-35.00", "2500")).ok, false);
  assert.equal(validarFormularioReglasEnvio(reglas("35.00", "-1")).ok, false);
});

test("el texto y los campos vacíos se rechazan", () => {
  for (const bruto of ["", "   ", "treinta y cinco", "Q35", "35 quetzales", "--5", "3.5.5"]) {
    assert.equal(
      validarFormularioReglasEnvio(reglas(bruto, "2500")).ok,
      false,
      `debería rechazar «${bruto}»`,
    );
  }
});

test("la notación científica se rechaza aunque JavaScript la entienda", () => {
  // `Number("3.5e3")` da 3500, así que una conversión ingenua la aceptaría y
  // guardaría un importe que nadie escribió a propósito.
  for (const bruto of ["3.5e3", "1e2", "2.5E3", "Infinity", "NaN"]) {
    assert.equal(
      validarFormularioReglasEnvio(reglas(bruto, "2500")).ok,
      false,
      `debería rechazar «${bruto}»`,
    );
  }
});

test("por encima del máximo permitido se rechaza", () => {
  assert.equal(validarFormularioReglasEnvio(reglas("1000000.01", "2500")).ok, false);
  assert.equal(validarFormularioReglasEnvio(reglas("35", "1000000.01")).ok, false);
  // Justo el máximo sí entra.
  const r = validarFormularioReglasEnvio(reglas("1000000.00", "1000000"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.tarifaCents, 100_000_000);
  }
});

test("los errores se expresan en quetzales, sin hablar de centavos", () => {
  const errores = [
    validarFormularioReglasEnvio(reglas("-1", "2500")),
    validarFormularioReglasEnvio(reglas("35.005", "2500")),
    validarFormularioReglasEnvio(reglas("", "2500")),
    validarFormularioReglasEnvio(reglas("9999999", "2500")),
  ];
  for (const r of errores) {
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(
        /c[eé]ntimo|centavo/i.test(r.error),
        false,
        `el mensaje no debe hablar de centavos: «${r.error}»`,
      );
      assert.match(r.error, /Q|quetzal/i, `el mensaje debería hablar en quetzales: «${r.error}»`);
    }
  }
});

// ---------------------------------------------------------------------------
// Recogida en tienda
// ---------------------------------------------------------------------------

function recogida(activa: string | null, texto: string): FormData {
  const fd = new FormData();
  if (activa !== null) fd.set("activa", activa);
  fd.set("texto", texto);
  return fd;
}

test("activar la recogida exige un texto para el cliente", () => {
  const r = validarFormularioRecogida(recogida("on", "   "));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /informaci[oó]n|texto/i);
  }
});

test("activar la recogida con texto es válido y lo recorta", () => {
  const r = validarFormularioRecogida(recogida("on", "  Vista Hermosa 2, zona 15  "));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.recogida.activa, true);
    assert.equal(r.recogida.texto, "Vista Hermosa 2, zona 15");
  }
});

test("desactivarla es válido y no exige texto", () => {
  const r = validarFormularioRecogida(recogida(null, ""));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.recogida.activa, false);
    assert.equal(r.recogida.texto, "");
  }
});

test("desactivarla conserva el texto que hubiera escrito, para no perderlo", () => {
  const r = validarFormularioRecogida(recogida(null, "Vista Hermosa 2, zona 15"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.recogida.activa, false);
    assert.equal(r.recogida.texto, "Vista Hermosa 2, zona 15");
  }
});

test("el texto no puede pasar de 200 caracteres", () => {
  const r = validarFormularioRecogida(recogida("on", "x".repeat(201)));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /200/);
  }
});

test("exactamente 200 caracteres se admite", () => {
  const r = validarFormularioRecogida(recogida("on", "x".repeat(200)));
  assert.equal(r.ok, true);
});

test("un campo «texto» que no sea texto se rechaza, no se convierte en «[object File]»", () => {
  // Un POST multipart hecho a mano puede mandar un fichero donde se espera texto.
  // `String(...)` lo aceptaría y guardaría «[object File]» como la información
  // que ve el cliente.
  const fd = new FormData();
  fd.set("activa", "on");
  fd.set("texto", new File(["contenido"], "nota.txt", { type: "text/plain" }));

  const r = validarFormularioRecogida(fd);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(
      r.error.includes("[object File]"),
      false,
      "y el mensaje tampoco repite la basura recibida",
    );
  }
});
