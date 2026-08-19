import { expect, test } from "@playwright/test";

test("initializes quote restoration from the public catalog without client errors", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/catalogo");
  await page.waitForTimeout(100);

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

test("offers the optional series filter only in the product view", async ({ page }) => {
  await page.goto("/catalogo");

  await expect(page.getByText("Filtrar por serie", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(page.getByText("Filtrar por serie", { exact: true })).toBeVisible();

  const aplSeries = page.getByRole("button", { name: /^APL\s+41$/ });
  await aplSeries.click();

  await expect(aplSeries).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Serie: APL", { exact: true })).toBeVisible();
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
