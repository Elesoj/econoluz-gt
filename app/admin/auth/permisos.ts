import type { RolAdmin } from "./types";

/** En 9A el empleado solo consulta. Los permisos operativos llegan en 9B. */
export const puedeEscribirEnvios = (rol: RolAdmin): boolean => rol === "administrador";
