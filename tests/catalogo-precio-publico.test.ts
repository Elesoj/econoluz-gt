import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

test("solo se publica un precio finito y mayor que cero", () => {
  // La frontera pública no se fía de que el panel valide: un cero o un negativo
  // podrían venir de una carga anterior o de una escritura directa en la base,
  // y publicarlos pondría el producto a la venta regalado. Ninguno de estos
  // cinco casos llega al navegador.
  for (const invalido of [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      "priceGtq" in toPublicProduct(UNO, { priceGtq: invalido }),
      false,
      `${invalido} no debería publicarse`,
    );
  }

  assert.equal("priceGtq" in toPublicProduct(UNO, { priceGtq: null }), false);
  assert.equal("priceGtq" in toPublicProduct(UNO, { priceGtq: undefined }), false);
  assert.equal("priceGtq" in toPublicProduct(UNO), false);

  // Y el caso que sí: un importe normal se publica tal cual.
  assert.equal(toPublicProduct(UNO, { priceGtq: 0.01 }).priceGtq, 0.01);
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

test("con precio, el producto es comprable", () => {
  // Lo que decide que la tarjeta ofrezca «Agregar al carrito» es que exista
  // `priceGtq`. No hay ninguna otra casilla que autorice la venta: el precio
  // se pone desde el panel y con eso el producto está a la venta.
  const publico = toPublicProduct(UNO, { priceGtq: 349 });
  assert.equal(typeof publico.priceGtq, "number");
  assert.equal(publico.priceGtq, 349);
});

test("sin precio, el producto solo se puede consultar", () => {
  // Sin `priceGtq` la tarjeta dice «Consultar precio» y lleva a /asesoria.
  // Borrar el precio en el panel es la forma de retirar algo de la venta.
  const publico = toPublicProduct(UNO, { priceGtq: null });
  assert.equal("priceGtq" in publico, false);
});

test("la lectura pública del catálogo no pide existencias", () => {
  // La consulta que alimenta /catalogo no menciona `stock` en ninguna forma:
  // el inventario no baja al navegador, y de hecho la empresa no lleva
  // existencias. El carrito pregunta aparte y solo por lo que lleva dentro.
  const fuente = readFileSync(
    join(import.meta.dirname, "..", "app", "data", "catalog.server.ts"),
    "utf8",
  );
  assert.ok(!/\bstock\b/.test(fuente), "catalog.server.ts menciona stock");
});

test("nada fuera del panel descuenta existencias", () => {
  // Leer el inventario para avisar es una cosa; descontarlo al vender es otra
  // que este proyecto no hace y no debe empezar a hacer por descuido.
  const raiz = join(import.meta.dirname, "..", "app");
  const sospechosas = ["data", "tienda", "api", "carrito", "catalogo"].flatMap((carpeta) => {
    const ruta = join(raiz, carpeta);
    const recorrer = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
        const hijo = join(dir, entrada.name);
        if (entrada.isDirectory()) return recorrer(hijo);
        return /\.tsx?$/.test(entrada.name) ? [hijo] : [];
      });
    return recorrer(ruta);
  });

  for (const archivo of sospechosas) {
    const contenido = readFileSync(archivo, "utf8");
    assert.ok(
      !/update\s+products[\s\S]{0,160}stock/i.test(contenido),
      `${archivo} parece escribir en las existencias`,
    );
  }
});
