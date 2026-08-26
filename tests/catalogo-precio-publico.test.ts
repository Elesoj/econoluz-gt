import assert from "node:assert/strict";
import { test } from "node:test";
import { products } from "../app/data/products";
import { toPublicProduct } from "../app/data/publicProduct";
import { formatPrice } from "../app/lib/formatters";

const UNO = products[0];

test("un producto sin precio sale exactamente igual que antes", () => {
  // Importa que el campo ni siquiera exista: la huella congelada del catálogo
  // compara los objetos completos, y un `priceGtq: null` en los 313 la rompería.
  const publico = toPublicProduct(UNO);
  assert.equal("priceGtq" in publico, false);
});

test("un producto con precio lo lleva al catálogo público", () => {
  const publico = toPublicProduct(UNO, { priceGtq: 1250.5 });
  assert.equal(publico.priceGtq, 1250.5);
});

test("un precio que no es número no se publica", () => {
  assert.equal("priceGtq" in toPublicProduct(UNO, { priceGtq: null }), false);
  assert.equal("priceGtq" in toPublicProduct(UNO, { priceGtq: Number.NaN }), false);
});

test("el precio cero es un precio y se publica", () => {
  // Cero no es lo mismo que «sin precio»: si alguien lo pone a cero, se enseña.
  assert.equal(toPublicProduct(UNO, { priceGtq: 0 }).priceGtq, 0);
});

test("el precio se escribe en quetzales con dos decimales", () => {
  assert.equal(formatPrice(1250), "Q1,250.00");
  assert.equal(formatPrice(1250.5), "Q1,250.50");
  assert.equal(formatPrice(0), "Q0.00");
});

test("un producto sin existencias apuntadas sale exactamente igual que antes", () => {
  // Mismo motivo que con el precio: un `stock: null` en los 313 productos
  // rompería la huella congelada del catálogo sin que nada haya cambiado.
  assert.equal("stock" in toPublicProduct(UNO), false);
  assert.equal("stock" in toPublicProduct(UNO, { stock: null }), false);
});

test("las existencias apuntadas llegan al catálogo público", () => {
  assert.equal(toPublicProduct(UNO, { stock: 12 }).stock, 12);
});

test("cero existencias es un dato y se publica", () => {
  // Cero significa «se agotó», que no es lo mismo que «no lo he contado».
  assert.equal(toPublicProduct(UNO, { stock: 0 }).stock, 0);
});

test("unas existencias que no son un entero no se publican", () => {
  assert.equal("stock" in toPublicProduct(UNO, { stock: Number.NaN }), false);
  assert.equal("stock" in toPublicProduct(UNO, { stock: 2.5 }), false);
});
