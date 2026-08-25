import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Los worktrees de git viven dentro del proyecto y llevan su propia copia
    // del código y de node_modules. Sin esto, `npm run lint` analiza dos veces
    // el proyecto entero y saca cientos de errores de dependencias ajenas.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
