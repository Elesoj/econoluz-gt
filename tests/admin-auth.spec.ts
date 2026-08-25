import { expect, test } from "@playwright/test";

test("redirige al acceso y mantiene el panel fuera de buscadores", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await expect(page.getByRole("heading", { name: "Acceso al panel" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("el acceso no muestra herramientas comerciales públicas", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.getByRole("link", { name: "Contactar por WhatsApp" })).toHaveCount(0);
});

test("el formulario es identificable y navegable por teclado", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("unas credenciales equivocadas no revelan si el correo existe", async ({ page }) => {
  await page.goto("/admin/entrar");
  await page.getByLabel("Correo electrónico").fill("nadie@ejemplo.com");
  await page.getByLabel("Contraseña").fill("contraseña equivocada");
  await page.getByRole("button", { name: "Entrar" }).click();

  const aviso = page.getByRole("alert");
  await expect(aviso).toBeVisible();
  await expect(aviso).not.toContainText(/no existe|no encontrado|incorrecta/i);
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("el botón flotante de WhatsApp sigue en el sitio público", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Contactar por WhatsApp" })).toBeVisible();
});
