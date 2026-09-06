import { expect, test } from "@playwright/test";

/** `Q1,250.00`, el formato de precio del proyecto. */
const PRECIO = /^Q[\d.,]+$/;

/**
 * El recorrido completo del carrito. Es la única prueba que ejerce el pegamento
 * con React —el store compartido y la hidratación desde localStorage—, que la
 * lógica pura de las pruebas de unidad no puede tocar.
 */
test("comprar un producto con precio y encontrarlo al volver", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  const agregar = page.getByRole("button", { name: "Agregar al carrito" }).first();

  // Si ningún producto tiene precio, no hay tienda que probar. Se dice en voz
  // alta en vez de dar la prueba por buena: el catálogo se administra a mano y
  // un día puede amanecer sin precios.
  await expect(
    agregar,
    "ningún producto del catálogo tiene precio: ponle precio a alguno desde el panel",
  ).toBeVisible();

  await agregar.click();

  const contador = page.getByRole("link", { name: /Ver el carrito/ });
  await expect(contador).toBeVisible();

  // Se espera a la navegación que provoca el clic, no a que la URL cambie dentro
  // del tiempo de una aserción. Son cosas distintas: `toHaveURL` sondea durante
  // cinco segundos fijos, y en el servidor de desarrollo esta ruta puede tardar
  // más —compila bajo demanda, y con `modelo_catalogo` en `shadow` el catálogo
  // compara los 313 productos en cada carga—. `waitForURL` espera al evento de
  // navegación con el plazo del test, así que sincroniza con lo que de verdad
  // tiene que ocurrir en vez de apostar por un número.
  await contador.click();
  await page.waitForURL(/\/carrito$/);

  await expect(page.getByRole("heading", { name: "Tu carrito" })).toBeVisible();
  await expect(page.getByText(/^Total: Q/)).toBeVisible();

  // Lo que de verdad se comprueba aquí: que el carrito sobrevive a recargar.
  await page.reload();
  await expect(page.getByText(/^Total: Q/)).toBeVisible();
});

test("cambiar la cantidad recalcula el total", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await page.getByRole("button", { name: "Agregar al carrito" }).first().click();
  await page.getByRole("link", { name: /Ver el carrito/ }).click();
  // Igual que arriba: primero la navegación, y solo después se busca el total.
  await page.waitForURL(/\/carrito$/);

  const total = page.getByText(/^Total: Q/);
  const inicial = await total.textContent();

  await page.getByRole("spinbutton").first().fill("3");

  await expect(total).not.toHaveText(inicial ?? "");
  await expect(total).toHaveText(/^Total: Q/);
});

test("un producto sin precio ofrece consultar, no comprar", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  // La regla «precio = a la venta» vista desde fuera: donde no hay precio no
  // hay botón de compra, pero la tarjeta tampoco se queda muda.
  const sinPrecio = page
    .locator("article")
    .filter({ hasText: "Precio a consultar" })
    .first();

  await expect(sinPrecio).toBeVisible();
  await expect(
    sinPrecio.getByRole("button", { name: "Agregar al carrito" }),
  ).toHaveCount(0);

  const consultar = sinPrecio.getByRole("link", { name: "Consultar precio" });
  await expect(consultar).toBeVisible();
  await expect(consultar).toHaveAttribute("href", /\/asesoria\?producto=ECO-/);
});

test("el catálogo ya no ofrece cotizar producto a producto", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(page.getByRole("button", { name: "Agregar al carrito" }).first()).toBeVisible();

  await expect(page.getByRole("button", { name: /Agregar a cotizaci/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver selección" })).toHaveCount(0);
});

test("el inventario no viaja al navegador", async ({ page }) => {
  // El número de unidades es información del negocio: si estuviera en el HTML,
  // cualquiera podría leer las existencias de los 313 productos sin comprar.
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(page.getByRole("button", { name: "Agregar al carrito" }).first()).toBeVisible();

  const html = await page.content();
  expect(html).not.toMatch(/"stock"\s*:\s*\d/);
  expect(html).not.toMatch(/stock\\\\":\d/);
});

test("el carrito vacío no enseña contador en la barra", async ({ page }) => {
  await page.goto("/catalogo");
  await expect(page.getByRole("link", { name: /Ver el carrito/ })).toHaveCount(0);
});

test("la ficha técnica sigue enseñando el precio", async ({ page }) => {
  // Regresión: la tarjeta se ha tocado, y la ficha comparte producto.
  await page.goto("/catalogo");
  const search = page.getByLabel("Buscar en catálogo");
  await search.fill("ECO-IND-0048");
  await search.press("Enter");
  await page.getByRole("button", { name: /Ver ficha técnica/ }).click();

  await expect(
    page.getByText("Precio a consultar").or(page.getByText(PRECIO)).first(),
  ).toBeVisible();
});
