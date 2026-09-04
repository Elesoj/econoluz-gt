// tests/geografia-instantanea.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

interface Departamento {
  codigo: string;
  nombre: string;
}

interface Municipio {
  codigo: string;
  departamento: string;
  nombre: string;
}

interface Catalogo {
  departamentos: Departamento[];
  municipios: Municipio[];
}

const RUTA_JSON = "db/datos/geografia-gt.json";
const RUTA_FUENTE = "db/datos/geografia-gt.FUENTE.md";
const RUTA_SCRIPT = "scripts/preparar-geografia.mjs";
const RUTA_SPEC = "docs/superpowers/specs/2026-09-03-envios-tarifas-design.md";

const crudo = readFileSync(RUTA_JSON, "utf8");
const catalogo = JSON.parse(crudo) as Catalogo;

test("el catálogo trae 22 departamentos y 340 municipios", () => {
  assert.equal(catalogo.departamentos.length, 22);
  assert.equal(catalogo.municipios.length, 340);
});

test("los códigos de departamento van de 01 a 22 y son únicos", () => {
  const codigos = catalogo.departamentos.map((d: Departamento) => d.codigo);
  assert.equal(new Set(codigos).size, 22);
  for (const c of codigos) assert.match(c, /^(0[1-9]|1[0-9]|2[0-2])$/);
});

test("cada municipio tiene cuatro dígitos y pertenece a su departamento", () => {
  const departamentos = new Set(catalogo.departamentos.map((d: Departamento) => d.codigo));
  for (const m of catalogo.municipios) {
    assert.match(m.codigo, /^\d{4}$/, `código inválido: ${m.codigo}`);
    assert.equal(m.codigo.slice(0, 2), m.departamento, `no encaja: ${m.codigo}`);
    assert.ok(departamentos.has(m.departamento), `departamento desconocido: ${m.departamento}`);
  }
});

test("los códigos de municipio son únicos y ningún nombre está vacío", () => {
  const codigos = catalogo.municipios.map((m: Municipio) => m.codigo);
  assert.equal(new Set(codigos).size, 340);
  for (const m of catalogo.municipios) {
    assert.ok(m.nombre.trim().length > 0, `sin nombre: ${m.codigo}`);
  }
});

test("no se comprueba continuidad: los saltos de código son legítimos, y de hecho los hay", () => {
  // Un código oficial no tiene por qué ser correlativo, así que la
  // completitud se mide contra este conjunto versionado y no contra una
  // secuencia. Esta prueba no se limita a repetir el conteo de la prueba 1
  // (eso sería tautológico): afirma el hecho real que documenta, que la
  // secuencia de códigos SÍ trae huecos y aun así el catálogo es válido.
  const numeros = catalogo.municipios.map((m: Municipio) => Number(m.codigo)).sort((a: number, b: number) => a - b);
  let hayAlgunSalto = false;
  for (let i = 1; i < numeros.length; i++) {
    if (numeros[i] - numeros[i - 1] > 1) {
      hayAlgunSalto = true;
      break;
    }
  }
  assert.ok(hayAlgunSalto, "se esperaba al menos un salto de código legítimo y no se encontró ninguno");
});

// Las dos correcciones que la extracción automática necesita declaradas (una
// de ellas, hoy, sin efecto real porque el extractor ya la resuelve sola:
// ver FUENTE.md). Se prueban por su nombre exacto porque son justo las que
// un refactor del extractor puede volver a romper sin que nadie se entere.
const busca = (codigo: string): Municipio | undefined =>
  catalogo.municipios.find((m: Municipio) => m.codigo === codigo);

test("0923 es La Esperanza, y su vecino 0924 sigue siendo Palestina de los Altos", () => {
  assert.deepEqual(busca("0923"), { codigo: "0923", departamento: "09", nombre: "La Esperanza" });
  assert.deepEqual(busca("0924"), { codigo: "0924", departamento: "09", nombre: "Palestina de los Altos" });
});

test("la errata de 1330 está corregida y no reintroducida", () => {
  assert.equal(busca("1330")?.nombre, "Santiago Chimaltenango");
  assert.equal(catalogo.municipios.some((m: Municipio) => m.nombre.includes("Chimaltenanango")), false);
});

// --- Los 22 departamentos: pares, orden y formato de serialización ---
// Es la interfaz que exige el brief y, además, la parte del catálogo con la
// procedencia más débil (ver la limitación declarada en FUENTE.md): no hay
// ninguna otra red que la proteja si alguien la toca por error.

const DEPARTAMENTOS_ESPERADOS: Departamento[] = [
  { codigo: "01", nombre: "Guatemala" },
  { codigo: "02", nombre: "El Progreso" },
  { codigo: "03", nombre: "Sacatepéquez" },
  { codigo: "04", nombre: "Chimaltenango" },
  { codigo: "05", nombre: "Escuintla" },
  { codigo: "06", nombre: "Santa Rosa" },
  { codigo: "07", nombre: "Sololá" },
  { codigo: "08", nombre: "Totonicapán" },
  { codigo: "09", nombre: "Quetzaltenango" },
  { codigo: "10", nombre: "Suchitepéquez" },
  { codigo: "11", nombre: "Retalhuleu" },
  { codigo: "12", nombre: "San Marcos" },
  { codigo: "13", nombre: "Huehuetenango" },
  { codigo: "14", nombre: "Quiché" },
  { codigo: "15", nombre: "Baja Verapaz" },
  { codigo: "16", nombre: "Alta Verapaz" },
  { codigo: "17", nombre: "Petén" },
  { codigo: "18", nombre: "Izabal" },
  { codigo: "19", nombre: "Zacapa" },
  { codigo: "20", nombre: "Chiquimula" },
  { codigo: "21", nombre: "Jalapa" },
  { codigo: "22", nombre: "Jutiapa" },
];

test("los 22 departamentos traen exactamente su código y su nombre oficial", () => {
  assert.deepEqual(catalogo.departamentos, DEPARTAMENTOS_ESPERADOS);
});

test("departamentos y municipios vienen ordenados por código ascendente", () => {
  const codigosDep = catalogo.departamentos.map((d: Departamento) => d.codigo);
  const codigosDepOrdenados = [...codigosDep].sort();
  assert.deepEqual(codigosDep, codigosDepOrdenados);

  const codigosMun = catalogo.municipios.map((m: Municipio) => m.codigo);
  const codigosMunOrdenados = [...codigosMun].sort();
  assert.deepEqual(codigosMun, codigosMunOrdenados);
});

test("el JSON está serializado con dos espacios de sangría y salto de línea final", () => {
  assert.ok(crudo.endsWith("\n"), "falta el salto de línea final");
  assert.ok(!crudo.endsWith("\n\n"), "sobra un salto de línea al final");
  // Reserializar el mismo objeto con dos espacios de sangría tiene que dar
  // literalmente el mismo texto: es la comprobación de que el archivo real
  // -no solo su contenido ya interpretado- respeta el formato de la interfaz.
  const reserializado = JSON.stringify(catalogo, null, 2) + "\n";
  assert.equal(crudo, reserializado);
});

// --- Las huellas: la §14 del criterio de aceptación exige que no se
// desincronicen en silencio en ningún commit posterior ---

test("la huella SHA-256 de geografia-gt.json coincide con la que registran FUENTE.md y la especificación", () => {
  const huellaReal = createHash("sha256").update(crudo).digest("hex");

  const fuente = readFileSync(RUTA_FUENTE, "utf8");
  const huellaEnFuente = /SHA-256 de `db\/datos\/geografia-gt\.json`:\*\*\s*`([0-9a-f]{64})`/.exec(fuente)?.[1];
  assert.ok(huellaEnFuente, "no se encontró la huella del JSON en FUENTE.md");
  assert.equal(huellaEnFuente, huellaReal, "la huella de FUENTE.md no coincide con el archivo real");

  const spec = readFileSync(RUTA_SPEC, "utf8");
  const huellaEnSpec = /SHA-256 de la instantánea normalizada\*\* \| `([0-9a-f]{64})`/.exec(spec)?.[1];
  assert.ok(huellaEnSpec, "no se encontró la huella de la instantánea en la especificación");
  assert.equal(huellaEnSpec, huellaReal, "la huella de la especificación no coincide con el archivo real");
});

// --- Sincronía real de las tres listas de correcciones ---
// No basta con buscar las subcadenas "0923" y "1330": eso pasaría igual con
// la tabla de correcciones borrada. Aquí se comparan de verdad los tres
// mapas código -> nombre almacenado: el de CORRECCIONES en el script, el de
// la tabla de FUENTE.md y el de la tabla de la §4.2.3 de la especificación.

function extraerCorreccionesDelScript(textoScript: string): Record<string, string> {
  const inicio = textoScript.indexOf("const CORRECCIONES = {");
  assert.ok(inicio !== -1, "no se encontró CORRECCIONES en el script");
  const fin = textoScript.indexOf("};", inicio);
  const cuerpo = textoScript.slice(inicio, fin);
  const filas: Record<string, string> = {};
  const patron = /"(\d{3,4})":\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(cuerpo)) !== null) filas[m[1]] = m[2];
  return filas;
}

const PATRON_FILA_CORRECCION = /^\|\s*`?(\d{3,4})`?\s*\|[^|]*\|\s*`?([^|`]+?)`?\s*\|/;

// Localiza, a partir de `marcador`, la primera tabla markdown (su línea
// `|---|---|...`) y recoge SOLO las filas de datos que vienen justo después,
// deteniéndose en la primera línea que ya no es fila de esa tabla. Así no
// hace falta adivinar dónde "termina la sección": termina la tabla.
function extraerTablaTrasMarcador(texto: string, marcador: string): Record<string, string> {
  const desde = texto.indexOf(marcador);
  assert.ok(desde !== -1, `no se encontró «${marcador}»`);
  const lineas = texto.slice(desde).split(/\r?\n/);
  const indiceSeparador = lineas.findIndex((l) => /^\|\s*-{2,}/.test(l.trim()));
  assert.ok(indiceSeparador !== -1, `no se encontró la tabla tras «${marcador}»`);

  const filas: Record<string, string> = {};
  for (let i = indiceSeparador + 1; i < lineas.length; i++) {
    const m = PATRON_FILA_CORRECCION.exec(lineas[i].trim());
    if (!m) break;
    filas[m[1]] = m[2].trim();
  }
  return filas;
}

test("toda corrección aplicada está documentada en el archivo de procedencia", () => {
  const fuente = readFileSync(RUTA_FUENTE, "utf8");
  for (const codigo of ["0923", "1330"]) {
    assert.ok(fuente.includes(codigo), `sin documentar: ${codigo}`);
  }
  assert.match(fuente, /1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e/);
});

test("las correcciones del script, de FUENTE.md y de la especificación dicen exactamente lo mismo", () => {
  const textoScript = readFileSync(RUTA_SCRIPT, "utf8");
  const correccionesScript = extraerCorreccionesDelScript(textoScript);

  const fuente = readFileSync(RUTA_FUENTE, "utf8");
  const correccionesFuente = extraerTablaTrasMarcador(fuente, "## Correcciones aplicadas");

  const spec = readFileSync(RUTA_SPEC, "utf8");
  const correccionesSpec = extraerTablaTrasMarcador(spec, "Erratas y correcciones puntuales");

  const codigosScript = Object.keys(correccionesScript).sort();
  assert.deepEqual(codigosScript, ["0923", "1330"], "CORRECCIONES del script no es el esperado");
  assert.deepEqual(Object.keys(correccionesFuente).sort(), codigosScript, "los códigos de FUENTE.md no coinciden con CORRECCIONES");
  assert.deepEqual(Object.keys(correccionesSpec).sort(), codigosScript, "los códigos de la especificación no coinciden con CORRECCIONES");

  for (const codigo of codigosScript) {
    assert.equal(correccionesFuente[codigo], correccionesScript[codigo], `FUENTE.md dice otro nombre para ${codigo}`);
    assert.equal(correccionesSpec[codigo], correccionesScript[codigo], `la especificación dice otro nombre para ${codigo}`);
  }
});
