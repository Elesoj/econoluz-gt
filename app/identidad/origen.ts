/** Comprueba el origen de una mutación sin depender de Next.js. */
export function esMismoOrigen(origen: string | null, host: string | null): boolean {
  if (!origen || !host) return false;

  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}
