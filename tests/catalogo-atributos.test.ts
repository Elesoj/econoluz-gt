import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLUMNA_DE_TIPO,
  TIPOS_DE_ATRIBUTO,
  columnasLlenas,
  decidirRetirada,
  puedeCambiarseElTipo,
  validarAsignaciones,
  validarValor,
} from "../app/data/catalogo/atributos";

/**
 * Esta es la regla que da sentido al subproyecto: hoy «20 W» es una cadena y por eso no se
 * puede pedir «entre 15 y 25 W». `product_attribute_values` tiene cuatro columnas y
 * **exactamente una** debe llenarse según el tipo declarado del atributo.
 */
test("cada tipo llena su columna y deja vacias las demas", () => {
  const casos: [(typeof TIPOS_DE_ATRIBUTO)[number], unknown, string][] = [
    ["numero", 20, "value_number"],
    ["texto", "Aluminio", "value_text"],
    ["booleano", true, "value_bool"],
    ["opcion", "opt-3000k", "option_id"],
    ["opcion_multiple", "opt-sala", "option_id"],
  ];

  for (const [tipo, valor, columna] of casos) {
    const resultado = validarValor(tipo, valor);
    assert.equal(resultado.ok, true, `${tipo} con ${String(valor)} debería valer`);
    if (!resultado.ok) continue;

    assert.equal(columnasLlenas(resultado.columnas).length, 1, `${tipo} llena una sola columna`);
    assert.equal(columnasLlenas(resultado.columnas)[0], columna);
    assert.equal(COLUMNA_DE_TIPO[tipo], columna);
  }
});

test("un valor del tipo equivocado se rechaza con motivo", () => {
  const resultado = validarValor("numero", "20 W");

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /numero/i);
});

/**
 * `NaN` e `Infinity` son números para JavaScript y veneno para un filtro por rango: una
 * comparación contra ellos no es ni verdadera ni falsa. Tienen que caer aquí, no en la base.
 */
test("NaN e Infinity no son valores numericos aceptables", () => {
  for (const veneno of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(validarValor("numero", veneno).ok, false, `${veneno} no puede entrar`);
  }
});

test("el texto vacio o en blanco no cuenta como texto", () => {
  assert.equal(validarValor("texto", "").ok, false);
  assert.equal(validarValor("texto", "   ").ok, false);
});

test("el texto se guarda recortado, no como lo escribio quien lo cargo", () => {
  const resultado = validarValor("texto", "  Aluminio  ");
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.columnas.value_text, "Aluminio");
});

test("un booleano no admite la cadena 'true', que es el error tipico de un formulario", () => {
  assert.equal(validarValor("booleano", "true").ok, false);
});

test("una opcion necesita un identificador, no un texto libre cualquiera", () => {
  assert.equal(validarValor("opcion", "").ok, false);
  assert.equal(validarValor("opcion", 3000).ok, false);
});

test("un tipo desconocido se rechaza en vez de colarse sin columna", () => {
  // @ts-expect-error se comprueba justo el caso que TypeScript ya impide en compilación
  const resultado = validarValor("color", "rojo");
  assert.equal(resultado.ok, false);
});

test("todos los tipos declarados tienen columna, y ninguna sobra", () => {
  assert.deepEqual([...TIPOS_DE_ATRIBUTO].sort(), Object.keys(COLUMNA_DE_TIPO).sort());
});

// ---------------------------------------------------------------------------
// Administrar definiciones: crear, borrar lo no usado, desactivar lo usado
// ---------------------------------------------------------------------------

/**
 * Borrar un atributo que ya describe productos perdería esos datos sin avisar. Desde que
 * está usado solo puede desactivarse, y su clave sigue reservada.
 */
test("lo que nunca se uso se borra; lo usado solo se desactiva", () => {
  assert.equal(decidirRetirada(0), "borrar");
  assert.equal(decidirRetirada(1), "desactivar");
  assert.equal(decidirRetirada(313), "desactivar");
});

test("el tipo de un atributo usado no se puede cambiar", () => {
  assert.equal(puedeCambiarseElTipo(0), true);
  assert.equal(puedeCambiarseElTipo(1), false);
});

// ---------------------------------------------------------------------------
// Asignaciones a un producto
// ---------------------------------------------------------------------------

const ATRIBUTO_NUMERO = { id: "at-potencia", tipo: "numero" as const };
const ATRIBUTO_OPCION = { id: "at-temperatura", tipo: "opcion" as const };
const ATRIBUTO_MULTIPLE = { id: "at-ambiente", tipo: "opcion_multiple" as const };

const opcion = (id: string, atributoId: string, activa = true) => ({ id, atributoId, activa });

test("sin asignaciones un atributo es valido: no describir algo no es un error", () => {
  assert.equal(validarAsignaciones(ATRIBUTO_NUMERO, []).ok, true);
});

test("un escalar admite un valor", () => {
  const resultado = validarAsignaciones(ATRIBUTO_NUMERO, [{ clase: "escalar", valor: 20 }]);
  assert.equal(resultado.ok, true);
});

/**
 * Dos potencias para la misma lámpara no es un caso raro que haya que resolver: es un dato
 * imposible. La base lo impide con un índice único parcial y esto lo detecta antes.
 */
test("un escalar NO admite dos valores del mismo atributo", () => {
  const resultado = validarAsignaciones(ATRIBUTO_NUMERO, [
    { clase: "escalar", valor: 20 },
    { clase: "escalar", valor: 25 },
  ]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /un solo valor/i);
});

test("un atributo de opcion tampoco admite dos", () => {
  const resultado = validarAsignaciones(ATRIBUTO_OPCION, [
    { clase: "opcion", opcion: opcion("op-3000", "at-temperatura") },
    { clase: "opcion", opcion: opcion("op-4000", "at-temperatura") },
  ]);

  assert.equal(resultado.ok, false);
});

test("opcion_multiple si admite varias opciones distintas", () => {
  const resultado = validarAsignaciones(ATRIBUTO_MULTIPLE, [
    { clase: "opcion", opcion: opcion("op-sala", "at-ambiente") },
    { clase: "opcion", opcion: opcion("op-cocina", "at-ambiente") },
  ]);

  assert.equal(resultado.ok, true);
});

test("opcion_multiple NO admite la misma opcion dos veces", () => {
  const resultado = validarAsignaciones(ATRIBUTO_MULTIPLE, [
    { clase: "opcion", opcion: opcion("op-sala", "at-ambiente") },
    { clase: "opcion", opcion: opcion("op-sala", "at-ambiente") },
  ]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /dos veces|repetid/i);
});

/**
 * El error que un desplegable hace fácil: elegir la opción «3000 K» del atributo temperatura
 * y guardarla en el atributo ambiente. La base lo impide con una clave foránea compuesta.
 */
test("una opcion de otro atributo se rechaza", () => {
  const resultado = validarAsignaciones(ATRIBUTO_MULTIPLE, [
    { clase: "opcion", opcion: opcion("op-3000", "at-temperatura") },
  ]);

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /no pertenece/i);
});

/**
 * Desactivar una opción impide asignaciones nuevas pero conserva las históricas: por eso
 * esta regla vive aquí y no en el esquema, que no distingue una fila nueva de una vieja.
 */
test("una opcion desactivada no admite asignaciones nuevas", () => {
  const resultado = validarAsignaciones(ATRIBUTO_MULTIPLE, [
    { clase: "opcion", opcion: opcion("op-retirada", "at-ambiente", false) },
  ], "asignacion_nueva");

  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /desactivad/i);
});

test("una opcion desactivada ya existente puede conservarse al guardar", () => {
  const resultado = validarAsignaciones(
    ATRIBUTO_MULTIPLE,
    [{ clase: "opcion", opcion: opcion("op-retirada", "at-ambiente", false) }],
    "valor_existente",
  );

  assert.equal(resultado.ok, true);
});

test("a un atributo de opcion no se le puede meter un escalar", () => {
  assert.equal(
    validarAsignaciones(ATRIBUTO_OPCION, [{ clase: "escalar", valor: "3000 K" }]).ok,
    false,
  );
});

test("a un atributo escalar no se le puede meter una opcion", () => {
  assert.equal(
    validarAsignaciones(ATRIBUTO_NUMERO, [
      { clase: "opcion", opcion: opcion("op-20", "at-potencia") },
    ]).ok,
    false,
  );
});

test("un valor escalar invalido se rechaza con el motivo del tipo", () => {
  const resultado = validarAsignaciones(ATRIBUTO_NUMERO, [{ clase: "escalar", valor: "20 W" }]);
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.motivo, /numero/i);
});
