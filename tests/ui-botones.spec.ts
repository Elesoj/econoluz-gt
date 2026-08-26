import { expect, test } from "@playwright/test";

/**
 * Tailwind v4 cambió el preflight y los `<button>` pasaron a `cursor: default`.
 * El efecto es que ningún botón parece pulsable, y se nota más en el panel,
 * donde casi todo son botones. `app/globals.css` lo devuelve; esta prueba
 * existe para que una actualización futura no lo vuelva a quitar en silencio.
 */
test("los botones se ven pulsables", async ({ page }) => {
  await page.goto("/catalogo");

  const boton = page.getByRole("button", { name: "Mostrar todos los productos" });
  await expect(boton).toBeVisible();

  const cursor = await boton.evaluate((elemento) => getComputedStyle(elemento).cursor);
  expect(cursor).toBe("pointer");
});
