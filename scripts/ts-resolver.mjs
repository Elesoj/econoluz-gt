// Node 24 ejecuta TypeScript por su cuenta, pero no resuelve las importaciones
// sin extensión que usa el proyecto (`./catalogTaxonomy` en vez de
// `./catalogTaxonomy.ts`), porque en módulos ES la extensión es obligatoria.
//
// Este gancho prueba primero con `.ts` y solo si falla deja que Node siga su
// camino normal. Con eso, los scripts de `scripts/` pueden importar los datos
// del catálogo tal y como están escritos, sin compilar ni añadir dependencias.
const hasExtension = /\.[cm]?[jt]sx?$/;

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");

  if (isRelative && !hasExtension.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // No era un .ts: puede ser una carpeta con index o un .js real.
    }

    try {
      return await nextResolve(`${specifier}/index.ts`, context);
    } catch {
      // Tampoco: se resuelve por las reglas de siempre.
    }
  }

  return nextResolve(specifier, context);
}
