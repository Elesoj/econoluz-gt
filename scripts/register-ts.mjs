// Registra el gancho de resolución de `ts-resolver.mjs`.
// Uso: node --import ./scripts/register-ts.mjs ./scripts/<lo-que-sea>.mjs
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
