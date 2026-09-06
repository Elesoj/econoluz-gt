import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Next.js carga `.env.local` cuando levanta su propio servidor, pero el proceso de
// Playwright es otro y no hereda nada. Sin esto, las pruebas que necesitan la base
// de datos o el emulador de Firebase obligarían a exportar cada variable a mano en
// la consola, y fallarían de formas difíciles de leer si a alguien se le olvidara
// una.
loadEnvConfig(process.cwd());

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "catalog-data-baseline.spec.ts",
    "catalog-public-boundary.spec.ts",
    "catalog-public-ui.spec.ts",
    "catalog-production-boundary.spec.ts",
    "catalog-navigation.spec.ts",
    "admin-auth.spec.ts",
    "catalog-precio.spec.ts",
    "ui-botones.spec.ts",
    "tienda-carrito.spec.ts",
    "cuenta.spec.ts",
    "envios-operativos.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    channel: "msedge",
  },
  webServer: {
    command: `npm.cmd run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // El servidor de desarrollo es un subproceso: recibe explícitamente lo que
    // necesita, para que sea imposible que las pruebas y el servidor hablen con
    // bases distintas.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NEON_RAMA_E2E: process.env.NEON_RAMA_E2E ?? "",
      NEON_ENDPOINT_PRODUCCION: process.env.NEON_ENDPOINT_PRODUCCION ?? "",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "",
      E2E_FIREBASE_API_KEY: process.env.E2E_FIREBASE_API_KEY ?? "",
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? "",
    },
  },
});
