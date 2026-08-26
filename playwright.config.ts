import { defineConfig } from "@playwright/test";

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
    "catalog-quote.spec.ts",
    "admin-auth.spec.ts",
    "catalog-precio.spec.ts",
    "ui-botones.spec.ts",
    "tienda-carrito.spec.ts",
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
  },
});
