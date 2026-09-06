// tests/envios-operativos.spec.ts
//
// Recorridos reales del panel de envíos y del formulario de direcciones. El
// cliente se autentica de verdad: emulador de Firebase, canje por
// `POST /api/clientes/sesion` y a partir de ahí navegación normal.
//
// Sustituye a `admin-envios.spec.ts`, que probaba el panel de zonas de reparto de
// 9A y sus formularios, retirados con el modelo operativo.

import { expect, test } from "@playwright/test";
import { autenticarComoAdmin, getE2ESql } from "./helpers/admin-e2e";
import {
  aprovisionarClienteE2E,
  autenticarComoCliente,
  exigirBaseE2EAislada,
  exigirEmuladorFirebase,
  exigirRamaE2E,
  limpiarClienteE2E,
  type ClienteE2E,
} from "./helpers/cliente-e2e";

test.beforeAll(async () => {
  // Sin base identificada positivamente y sin emulador, la suite se detiene aquí
  // en vez de degradar a un atajo.
  exigirBaseE2EAislada();
  exigirEmuladorFirebase();
  await exigirRamaE2E();
});

test.describe("Panel de envíos operativos", () => {
  test("1. cambio y restauración del método de una zona capitalina", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");

    // Cada zona tiene su propio desplegable con un id único; su formulario es el
    // ancestro, y es a él a quien hay que pulsarle el botón.
    const selectorZona1 = () => page.locator("#metodo-zona-1");
    const formularioZona1 = () => page.locator("form").filter({ has: page.locator("#metodo-zona-1") });

    await expect(selectorZona1()).toHaveValue("mensajero_propio");

    try {
      await selectorZona1().selectOption("guatex");
      await formularioZona1().getByRole("button", { name: /guardar método/i }).click();
      // La acción termina redirigiendo: sin esperarla, el `goto` siguiente puede
      // adelantarse a la escritura y leer el valor viejo.
      await page.waitForURL(/\/admin\/envios\?guardado=1/);

      await page.goto("/admin/envios");
      await expect(page.locator("#metodo-zona-1")).toHaveValue("guatex");
    } finally {
      // La configuración es global: dejarla cambiada envenenaría las demás pruebas.
      await page.goto("/admin/envios");
      await page.locator("#metodo-zona-1").selectOption("mensajero_propio");
      await page
        .locator("form")
        .filter({ has: page.locator("#metodo-zona-1") })
        .getByRole("button", { name: /guardar método/i })
        .click();
      await page.waitForURL(/\/admin\/envios\?guardado=1/);

      await page.goto("/admin/envios");
      await expect(page.locator("#metodo-zona-1")).toHaveValue("mensajero_propio");
    }
  });

  for (const [indice, zona] of [6, 17, 18].entries()) {
    test(`${indice + 2}. la zona ${zona} nace atendida por Guatex`, async ({ page, context }) => {
      await autenticarComoAdmin(context);
      await page.goto("/admin/envios");
      const selector = page.locator(`#metodo-zona-${zona}`);
      await expect(selector).toBeVisible();
      await expect(selector).toHaveValue("guatex");
    });
  }

  test("5. la zona 1 nace atendida por mensajero propio", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");
    const selector = page.locator("#metodo-zona-1");
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("mensajero_propio");
  });

  test("6. la zona 20 no existe ni se renderiza", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");
    await expect(page.locator("#metodo-zona-20")).toHaveCount(0);
    await expect(page.getByText(/^Zona 20$/)).toHaveCount(0);
    // Y las que sí existen son exactamente 22.
    await expect(page.locator('select[name="metodo"]')).toHaveCount(22);
  });

  test("7. no hay ninguna superficie para ponerle tarifa a Guatex", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");
    // Los dos únicos campos numéricos son los del mensajero propio.
    await expect(page.locator('input[name="tarifaCents"]')).toHaveCount(1);
    await expect(page.locator('input[name="umbralGratisCents"]')).toHaveCount(1);
    await expect(page.locator('input[type="number"]')).toHaveCount(2);
  });

  test("8. la ficha de zona de 9A redirige a la portada", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios/metropolitana");
    await expect(page).toHaveURL(/\/admin\/envios$/);
  });
});

test.describe("Direcciones del cliente con zona capitalina", () => {
  let cliente: ClienteE2E;

  test.beforeEach(async ({ context }) => {
    cliente = await aprovisionarClienteE2E(context, "direcciones");
  });

  test.afterEach(async () => {
    if (cliente?.userId) {
      // Sin `try`: si la limpieza falla, la prueba tiene que enterarse.
      await limpiarClienteE2E(cliente.userId);
    }
  });

  test("9. en el municipio de Guatemala la zona es obligatoria y se avisa en pantalla", async ({
    page,
    context,
  }) => {
    await autenticarComoCliente(context, cliente);
    await page.goto("/cuenta/direcciones");
    await expect(page.getByRole("heading", { name: /direcciones/i })).toBeVisible();

    await page.fill('input[name="destinatario"]', "Cliente Validación Zona");
    await page.fill('input[name="telefono"]', "55554444");
    await page.selectOption('select[name="departamentoCodigo"]', "01");
    await page.selectOption('select[name="municipioCodigo"]', "0101");
    await page.fill('input[name="direccion"]', "Avenida Las Américas 1-00");

    // El desplegable de zona aparece solo cuando el municipio es Guatemala.
    const selectorZona = page.locator('select[name="zonaCapitalina"]');
    await expect(selectorZona).toBeVisible();

    // Se deja sin elegir a propósito. El campo es `required`, así que el navegador
    // ni siquiera envía el formulario: se comprueba el mensaje de validación real.
    await page.getByRole("button", { name: /guardar dirección/i }).click();

    const mensajeNavegador = await selectorZona.evaluate(
      (elemento) => (elemento as HTMLSelectElement).validationMessage,
    );
    expect(mensajeNavegador.length).toBeGreaterThan(0);

    // Y no se guardó nada. Esta consulta es una comprobación posterior, no la
    // acción principal: lo que se está probando es la interfaz.
    const sql = getE2ESql();
    const filas = await sql`SELECT count(*)::int AS total FROM user_addresses WHERE user_id = ${cliente.userId}`;
    expect(filas[0].total).toBe(0);
  });

  test("10. una dirección de Mixco se guarda con zona_capitalina nula", async ({ page, context }) => {
    await autenticarComoCliente(context, cliente);
    await page.goto("/cuenta/direcciones");

    await page.fill('input[name="destinatario"]', "Carlos Mixco");
    await page.fill('input[name="telefono"]', "55551122");
    await page.selectOption('select[name="departamentoCodigo"]', "01");
    await page.selectOption('select[name="municipioCodigo"]', "0108");

    // Fuera de la capital el desplegable de zona no se pinta.
    await expect(page.locator('select[name="zonaCapitalina"]')).toHaveCount(0);

    await page.fill('input[name="direccion"]', "Km 15 Calzada Roosevelt");
    await page.getByRole("button", { name: /guardar dirección/i }).click();

    await expect(page.getByText("Carlos Mixco")).toBeVisible();
    await expect(page.getByText(/Mixco/i).first()).toBeVisible();

    const sql = getE2ESql();
    const filas = await sql`
      SELECT departamento_codigo, municipio_codigo, zona_capitalina
        FROM user_addresses WHERE user_id = ${cliente.userId}
    `;
    expect(filas.length).toBe(1);
    expect(filas[0].departamento_codigo).toBe("01");
    expect(filas[0].municipio_codigo).toBe("0108");
    expect(filas[0].zona_capitalina).toBeNull();
  });

  test("11. una dirección capitalina con zona 14 persiste tras recargar", async ({
    page,
    context,
  }) => {
    await autenticarComoCliente(context, cliente);
    await page.goto("/cuenta/direcciones");

    await page.fill('input[name="destinatario"]', "Ana Persistente");
    await page.fill('input[name="telefono"]', "55553344");
    await page.selectOption('select[name="departamentoCodigo"]', "01");
    await page.selectOption('select[name="municipioCodigo"]', "0101");
    await page.selectOption('select[name="zonaCapitalina"]', "14");
    await page.fill('input[name="direccion"]', "Avenida Las Américas 15-20");
    await page.getByRole("button", { name: /guardar dirección/i }).click();

    await expect(page.getByText("Ana Persistente")).toBeVisible();

    // Recarga completa: lo que se comprueba es que la interfaz vuelve a pintar el
    // dato leído de la base, no un estado que quedara en memoria.
    await page.reload();
    await expect(page.getByText("Ana Persistente")).toBeVisible();
    await expect(page.getByText(/Avenida Las Américas 15-20/i)).toBeVisible();
    await expect(page.getByText(/zona 14/i)).toBeVisible();

    const sql = getE2ESql();
    const filas = await sql`
      SELECT destinatario, departamento_codigo, municipio_codigo, zona_capitalina
        FROM user_addresses WHERE user_id = ${cliente.userId}
    `;
    expect(filas.length).toBe(1);
    expect(filas[0].destinatario).toBe("Ana Persistente");
    expect(filas[0].zona_capitalina).toBe(14);
  });

  test("12. la zona 20 no se ofrece en el desplegable del cliente", async ({ page, context }) => {
    await autenticarComoCliente(context, cliente);
    await page.goto("/cuenta/direcciones");

    await page.selectOption('select[name="departamentoCodigo"]', "01");
    await page.selectOption('select[name="municipioCodigo"]', "0101");

    const opciones = page.locator('select[name="zonaCapitalina"] option');
    // 22 zonas más la opción vacía de «Selecciona la zona».
    await expect(opciones).toHaveCount(23);
    await expect(page.locator('select[name="zonaCapitalina"] option[value="20"]')).toHaveCount(0);
    await expect(page.locator('select[name="zonaCapitalina"] option[value="25"]')).toHaveCount(1);
  });
  test("13. quitando el `required` a mano, el servidor sigue rechazando la dirección sin zona", async ({
    page,
    context,
  }) => {
    await autenticarComoCliente(context, cliente);
    await page.goto("/cuenta/direcciones");

    await page.fill('input[name="destinatario"]', "Saltandose el navegador");
    await page.fill('input[name="telefono"]', "55559999");
    await page.selectOption('select[name="departamentoCodigo"]', "01");
    await page.selectOption('select[name="municipioCodigo"]', "0101");
    await page.fill('input[name="direccion"]', "6a Avenida sin zona");

    // La validación del navegador es comodidad, no seguridad. Se le quita el
    // `required` al desplegable para comprobar quién manda de verdad.
    await page.locator('select[name="zonaCapitalina"]').evaluate((elemento) => {
      (elemento as HTMLSelectElement).removeAttribute("required");
    });

    await page.getByRole("button", { name: /guardar dirección/i }).click();

    // El servidor contesta con el aviso, y no guarda nada. Se busca el aviso del
    // formulario, no el anunciador de rutas de Next, que también es `role="alert"`.
    await expect(page.locator('p[role="alert"]')).toContainText(/zona capitalina/i);

    const sql = getE2ESql();
    const filas = await sql`SELECT count(*)::int AS total FROM user_addresses WHERE user_id = ${cliente.userId}`;
    expect(filas[0].total).toBe(0);
  });
});
