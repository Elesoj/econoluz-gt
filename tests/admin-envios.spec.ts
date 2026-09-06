// OBSOLETA — no se ejecuta. Fuera de `testMatch` desde la corrección del modelo
// operativo de envíos (04/09/2026).
//
// Prueba el panel de zonas de reparto de 9A: crear una zona, activarla, asignarle
// municipios y publicarle tarifas por tramos. Nada de eso existe ya: la portada
// `/admin/envios` es ahora la operativa y `/admin/envios/[zona]` redirige a ella.
// Lo que la sustituye es `tests/envios-operativos.spec.ts`.
//
// El archivo se conserva sin borrar, como las tablas de 9A, por si hiciera falta
// para auditoría histórica. Retirarlo necesita autorización del dueño.

import { expect, test } from "@playwright/test";
import {
  autenticarComoAdmin,
  limpiarZonaE2E,
} from "./helpers/admin-e2e";

const ZONA_PRUEBA_SLUG = "metropolitana-test";
const ZONA_PRUEBA_NOMBRE = "Metropolitana Test";

test.describe("Panel administrativo de envíos y tarifas", () => {
  test.beforeEach(async ({ context }) => {
    await autenticarComoAdmin(context);
    await limpiarZonaE2E(ZONA_PRUEBA_SLUG);
  });

  test.afterEach(async () => {
    await limpiarZonaE2E(ZONA_PRUEBA_SLUG);
  });

  test("flujo completo: crear zona, activar, asignar municipio, publicar tarifa y verificar cobertura parcial", async ({
    page,
  }) => {
    // 1. Navega a la portada de envíos y tarifas del panel
    await page.goto("/admin/envios");

    // 2. Verifica el encabezado honesto (§6.2 del diseño)
    await expect(
      page.getByText(/departamentos no calculan envío/i),
    ).toBeVisible();
    await expect(
      page.getByText(/sus clientes no podrán pagar en línea cuando exista el checkout/i),
    ).toBeVisible();

    // 3. Crear una nueva zona de prueba
    await page.getByLabel("Nombre de la zona *").fill(ZONA_PRUEBA_NOMBRE);
    await page.getByLabel("Código / slug (inmutable) *").fill(ZONA_PRUEBA_SLUG);
    await page.getByLabel("Método de entrega *").selectOption("mensajero_propio");
    await page.getByRole("button", { name: "Crear zona" }).click();

    // 4. Se redirige automáticamente a la ficha de la nueva zona
    await expect(page).toHaveURL(new RegExp(`/admin/envios/${ZONA_PRUEBA_SLUG}`));
    await expect(
      page.getByRole("heading", { name: ZONA_PRUEBA_NOMBRE }),
    ).toBeVisible();

    // 5. La zona nace inactiva: activarla
    const botonActivar = page.getByRole("button", { name: "Activar zona" });
    await expect(botonActivar).toBeVisible();
    await botonActivar.click();
    await expect(
      page.getByRole("button", { name: "Desactivar zona" }),
    ).toBeVisible();

    // 6. Asignar un municipio específico (Mixco - código 0108)
    await page.getByLabel("Ámbito").selectOption("municipio");
    await page.getByLabel("Localidad disponible").selectOption("0108");
    await page.getByRole("button", { name: "Asignar localidad" }).click();

    // Verifica que la cobertura aparece en la tabla de la ficha
    await expect(
      page.getByRole("cell", { name: "Mixco" }),
    ).toBeVisible();

    // 7. Publicar una tarifa ficticia oficial (Q35.00, gratis desde Q250.00, plazo 2 a 3 días)
    await page.locator("#importeQuetzales").fill("35.00");
    await page.locator("#umbralGratisQuetzales").fill("250.00");
    await page.locator("#plazoMinDias").fill("2");
    await page.locator("#plazoMaxDias").fill("3");
    await page.getByRole("button", { name: "Publicar tarifa oficial" }).click();

    // 8. Verifica que el estado deducido de la zona pasa a «Calcula envío»
    await expect(
      page.getByText("Calcula envío", { exact: true }).first(),
    ).toBeVisible();

    // 9. Volver a la portada de envíos y verificar la cobertura del departamento
    await page.goto("/admin/envios");

    // Comprobar que en la tabla de zonas aparece listada con «Calcula envío»
    const filaZona = page.getByRole("row", { name: new RegExp(ZONA_PRUEBA_NOMBRE, "i") });
    await expect(filaZona.getByText("Calcula envío")).toBeVisible();

    // Comprobar que el departamento de Guatemala (01) pasa de «Sin cobertura» a «Parcial»
    const filaGuatemala = page.getByRole("row", { name: /Guatemala/i }).filter({ hasText: "01" });
    await expect(filaGuatemala.getByText("Parcial")).toBeVisible();
    await expect(filaGuatemala.getByText("1 de 17")).toBeVisible();
  });
});
