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

  await contador.click();
  await expect(page).toHaveURL(/\/carrito$/);

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

  const total = page.getByText(/^Total: Q/);
  const inicial = await total.textContent();

  await page.getByRole("spinbutton").first().fill("3");

  await expect(total).not.toHaveText(inicial ?? "");
  await expect(total).toHaveText(/^Total: Q/);
});

test("un producto sin precio sigue siendo de cotización, no de carrito", async ({
  page,
}) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  // La regla «precio = a la venta» vista desde fuera: donde no hay precio, no
  // hay botón de compra.
  const sinPrecio = page
    .locator("article")
    .filter({ hasText: "Precio a consultar" })
    .first();

  await expect(sinPrecio).toBeVisible();
  await expect(
    sinPrecio.getByRole("button", { name: "Agregar al carrito" }),
  ).toHaveCount(0);
  await expect(
    sinPrecio.getByRole("button", { name: "Agregar a cotización" }),
  ).toBeVisible();
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
