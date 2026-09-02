import assert from "node:assert/strict";
import { test } from "node:test";
import { haySolape, precioVigente, type Precio } from "../app/data/catalogo/precios";

const AHORA = new Date("2026-09-02T12:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000);

const normal = (centavos: number): Precio => ({
  id: "p-normal",
  centavos,
  tipo: "normal",
  desde: null,
  hasta: null,
});

const promo = (centavos: number, desde: Date | null, hasta: Date | null, id = "p-promo"): Precio => ({
  id,
  centavos,
  tipo: "promocion",
  desde,
  hasta,
});

test("sin ningun precio el producto no se vende", () => {
  assert.equal(precioVigente([], AHORA), null);
});

test("con solo el precio normal, gana el normal", () => {
  assert.deepEqual(precioVigente([normal(125000)], AHORA), {
    id: "p-normal",
    centavos: 125000,
    tipo: "normal",
  });
});

test("una promocion vigente gana al precio normal", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, dias(-1), dias(5))], AHORA);
  assert.equal(resuelto?.centavos, 99900);
  assert.equal(resuelto?.tipo, "promocion");
});

/**
 * El fallo caro: cobrar una promoción que terminó ayer. La comparación es por el instante,
 * no por el día, y el final es exclusivo.
 */
test("una promocion caducada no cuenta", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, dias(-10), dias(-1))], AHORA);
  assert.equal(resuelto?.centavos, 125000);
  assert.equal(resuelto?.tipo, "normal");
});

test("una promocion futura tampoco cuenta", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, dias(3), dias(9))], AHORA);
  assert.equal(resuelto?.tipo, "normal");
});

test("el instante final es exclusivo: justo al terminar ya no se aplica", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, dias(-5), AHORA)], AHORA);
  assert.equal(resuelto?.tipo, "normal");
});

test("el instante inicial es inclusivo: justo al empezar ya se aplica", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, AHORA, dias(5))], AHORA);
  assert.equal(resuelto?.tipo, "promocion");
});

test("una promocion sin fin sigue vigente", () => {
  const resuelto = precioVigente([normal(125000), promo(99900, dias(-1), null)], AHORA);
  assert.equal(resuelto?.tipo, "promocion");
});

/**
 * El dinero se compara en centavos enteros (`CLAUDE.md` §6). Un precio con decimales es un
 * dato corrupto, y redondearlo en silencio es cómo se cobra de menos sin enterarse.
 */
test("un precio que no sea centavos enteros se ignora, no se redondea", () => {
  assert.equal(precioVigente([normal(1250.5)], AHORA), null);
});

test("un precio negativo se ignora", () => {
  assert.equal(precioVigente([normal(-100)], AHORA), null);
});

test("cero es un precio valido: regalar no es lo mismo que no tener precio", () => {
  assert.equal(precioVigente([normal(0)], AHORA)?.centavos, 0);
});

test("entre dos normales vigentes gana el que empezo despues", () => {
  const viejo: Precio = { ...normal(125000), id: "viejo", desde: dias(-10) };
  const nuevo: Precio = { ...normal(110000), id: "nuevo", desde: dias(-1) };

  assert.equal(precioVigente([viejo, nuevo], AHORA)?.id, "nuevo");
});

test("dos promociones que se solapan se detectan antes de intentar escribirlas", () => {
  assert.equal(
    haySolape([promo(1, dias(-5), dias(5), "a"), promo(2, dias(1), dias(9), "b")]),
    true,
  );
});

test("dos promociones consecutivas no se solapan: el final es exclusivo", () => {
  assert.equal(
    haySolape([promo(1, dias(-5), dias(0), "a"), promo(2, dias(0), dias(9), "b")]),
    false,
  );
});

test("una promocion sin fin se solapa con cualquiera posterior", () => {
  assert.equal(haySolape([promo(1, dias(-5), null, "a"), promo(2, dias(9), dias(10), "b")]), true);
});

test("una sola promocion nunca se solapa consigo misma", () => {
  assert.equal(haySolape([promo(1, dias(-5), dias(5), "a")]), false);
});
