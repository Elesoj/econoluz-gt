// El nombre canónico de un endpoint de Neon.
//
// Vive aparte de `guarda-neon.mjs` porque lo necesitan también las pruebas de
// Playwright, que transpilan a CommonJS y no pueden cargar un módulo que use
// `import.meta`. Duplicar la regla en dos sitios sería peor: es justo la que
// decide si una base es Producción.
//
// El sufijo `-pooler` solo indica el modo de conexión —a través del agrupador de
// conexiones— y NO distingue una base de otra: Producción también lo tiene. Por eso
// se retira antes de comparar.

export function endpointCanonico(host) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/-pooler(?=\.)/, "");
}
