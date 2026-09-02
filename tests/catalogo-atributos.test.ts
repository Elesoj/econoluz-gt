import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLUMNA_DE_TIPO,
  TIPOS_DE_ATRIBUTO,
  columnasLlenas,
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
