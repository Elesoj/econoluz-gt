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

test("las existencias NO bajan al catálogo público", () => {
  // El número de unidades es información del negocio: puesto en el HTML,
  // cualquiera podría leer el inventario de los 313 productos sin comprar
  // nada. El carrito lo pregunta al servidor solo por lo que lleva dentro
  // (`app/tienda/disponibilidad.server.ts`).
  assert.equal("stock" in toPublicProduct(UNO), false);
  assert.equal(
    "stock" in toPublicProduct(UNO, { priceGtq: 100 }),
    false,
  );
});
