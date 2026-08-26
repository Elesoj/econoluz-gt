import { expect, test } from "@playwright/test";

/** `Q1,250.00`, el formato de precio del proyecto. */
const PRECIO = /^Q[\d.,]+$/;

test("cada tarjeta del catálogo enseña su precio o dice que hay que consultarlo", async ({
  page,
}) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  const fichas = page.getByRole("button", { name: /Ver ficha técnica/ });
  await expect(fichas.first()).toBeVisible();

  const tarjetas = await fichas.count();
  const aConsultar = await page.getByText("Precio a consultar").count();
  const conPrecio = await page.getByText(PRECIO).count();

  // Ninguna tarjeta puede quedarse sin decir nada del precio: un hueco vacío
  // parecería un fallo de la página, no un producto pendiente de tarifar.
  expect(tarjetas).toBeGreaterThan(0);
  expect(aConsultar + conPrecio).toBe(tarjetas);
});

test("la ficha técnica enseña el precio junto a la referencia", async ({ page }) => {
  await page.goto("/catalogo");
  const search = page.getByLabel("Buscar en catálogo");

  await search.fill("ECO-IND-0048");
  await search.press("Enter");
  await page.getByRole("button", { name: /Ver ficha técnica/ }).click();

  await expect(
    page.getByText("Precio a consultar").or(page.getByText(PRECIO)).first(),
  ).toBeVisible();
});
