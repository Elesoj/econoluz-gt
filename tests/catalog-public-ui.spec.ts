import { expect, test } from "@playwright/test";

test("una selección de cotización vieja no rompe el catálogo", async ({ page }) => {
  // El catálogo dejó de tener cesto de cotización el 26/08/2026, pero en el
  // navegador de quien lo visitó antes puede quedar la clave guardada. Ya no
  // se restaura nada, y sobre todo no revienta la página.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "econoluz_catalog_quote",
      '{"items":[{"econoluzReference":"ECO-IND-0048","quantity":2}]}',
    );
  });

  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(
    page.getByRole("button", { name: "Agregar al carrito" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Ver selecci/i })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("shows only populated plate applications", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: /Placas y accesorios/ }).click();

  for (const application of [
    "Atenuadores",
    "Datos / LAN",
    "TV / coaxial",
    "Timbres",
    "Tapas ciegas",
  ]) {
    await expect(page.getByRole("button", { name: new RegExp(application) })).toBeVisible();
  }

  await expect(page.getByText("0 ref.", { exact: true })).toHaveCount(0);
});

test("never shows the supplier series filter or its names", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible();

  await expect(page.getByText("Filtrar por serie", { exact: true })).toHaveCount(0);

  // Los nombres de serie del fabricante identifican al proveedor ante el
  // cliente, asi que no pueden aparecer en ninguna vista del catalogo publico.
  for (const supplierSeries of [
    "Cuasar",
    "HB Pure",
    "HB Steel",
    "Highlens",
    "Supreme",
    "alto_montaje_ufo",
    "alto_montaje_switchable",
  ]) {
    await expect(page.getByText(supplierSeries, { exact: false })).toHaveCount(0);
  }
});

test("renders technical values that the old drawer omitted", async ({ page }) => {
  await page.goto("/catalogo");
  const search = page.getByLabel("Buscar en catálogo");

  await search.fill("ECO-IND-0048");
  await search.press("Enter");
  await page.getByRole("button", { name: /Ver ficha técnica/ }).click();

  await expect(page.getByText("Factor de potencia", { exact: true })).toBeVisible();
  await expect(page.getByText(">0.90", { exact: true })).toBeVisible();
  await expect(page.getByText("Protección contra sobretensión", { exact: true })).toBeVisible();
  await expect(page.getByText("Regulador de voltaje 4 V", { exact: true })).toBeVisible();
});
