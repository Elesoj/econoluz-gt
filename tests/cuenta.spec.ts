import { expect, test } from "@playwright/test";

test("sin sesión, la cuenta lleva a la pantalla de entrada", async ({ page }) => {
  await page.goto("/cuenta");
  await expect(page).toHaveURL(/\/cuenta\/entrar/);
});

test("la pantalla ofrece correo, registro y Google, pero no Facebook", async ({ page }) => {
  await page.goto("/cuenta/entrar");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /crear cuenta/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /facebook/i })).toHaveCount(0);
});

test("la cuenta del cliente no da acceso al panel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar/);
});
