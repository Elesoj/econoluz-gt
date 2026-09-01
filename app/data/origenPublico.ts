/**
 * De dónde sale el catálogo que ve el visitante.
 *
 * **La regla más importante de este subproyecto: la conexión privilegiada
 * nunca se usa como respaldo del camino público en producción.** Hacerlo
 * convertiría un descuido de configuración en la desaparición silenciosa de la
 * barrera que separa al visitante de los datos del proveedor: el sitio
 * seguiría funcionando igual y nadie se enteraría de que la protección ya no
 * está. Se sirve el catálogo escrito en el código, que es el respaldo seguro, y
 * se registra un error para que el descuido se note.
 *
 * En desarrollo local sí se admite la conexión privilegiada, **con aviso**:
 * exigir la credencial del rol público para arrancar el sitio en local
 * obligaría a tener base de datos y credenciales para tocar el diseño.
 *
 * En pruebas deben existir las dos conexiones y no se admite degradación; eso
 * lo vigila la batería, no este módulo.
 *
 * El módulo es puro a propósito. `catalog.server.ts` empieza con
 * `import "server-only"`, que impide importarlo desde `node:test`, así que la
 * decisión vive aparte y se prueba sin base de datos. Es el mismo reparto que
 * ya usan `panelStats.ts` y `panelStats.server.ts`.
 *
 * **Todavía no lo consume nadie**: el catálogo público sigue leyendo `products`
 * con la conexión de la aplicación y la bandera `modelo_catalogo` sigue en
 * `legacy`. Engancharlo aquí y ahora cambiaría la fuente del catálogo, que es
 * justo lo que este subproyecto tiene prohibido. Lo hará el subproyecto 3,
 * cuando el catálogo pase a leer la proyección pública.
 */

export type OrigenPublico = "rol-publico" | "conexion-privilegiada" | "respaldo-estatico";

export type DecisionDeOrigen = {
  origen: OrigenPublico;
  avisar: boolean;
  registrarErrorDeConfiguracion: boolean;
};

export function decidirOrigenPublico(entorno: {
  produccion: boolean;
  hayCadenaPublica: boolean;
}): DecisionDeOrigen {
  if (entorno.hayCadenaPublica) {
    return { origen: "rol-publico", avisar: false, registrarErrorDeConfiguracion: false };
  }

  if (entorno.produccion) {
    return {
      origen: "respaldo-estatico",
      avisar: false,
      registrarErrorDeConfiguracion: true,
    };
  }

  return { origen: "conexion-privilegiada", avisar: true, registrarErrorDeConfiguracion: false };
}

export type FuentesDelCatalogoPublico<T> = {
  desdeRolPublico: () => Promise<T>;
  desdeConexionPrivilegiada: () => Promise<T>;
  catalogoEstatico: () => T;
  registrar: (nivel: "info" | "error", suceso: string) => void;
};

/**
 * Ejecuta la decisión. Existe porque saber que la decisión *dice*
 * «respaldo-estatico» no demuestra que nadie llame a la conexión privilegiada:
 * aquí se ve, y la prueba lo comprueba con espías.
 *
 * No hay ningún `catch`, y es deliberado. Si el rol público está configurado y
 * falla, eso es una avería, no un descuido de configuración, y no autoriza a
 * probar suerte con la conexión privilegiada. Quien llame decidirá qué enseñar
 * ante un error, como ya hace hoy `getPublicCatalog` con su respaldo.
 */
export async function servirCatalogoPublico<T>(
  decision: DecisionDeOrigen,
  fuentes: FuentesDelCatalogoPublico<T>,
): Promise<T> {
  if (decision.registrarErrorDeConfiguracion) {
    fuentes.registrar("error", "catalogo-publico-sin-cadena-publica");
  }

  if (decision.avisar) {
    fuentes.registrar("info", "catalogo-publico-con-conexion-privilegiada");
  }

  switch (decision.origen) {
    case "rol-publico":
      return fuentes.desdeRolPublico();
    case "conexion-privilegiada":
      return fuentes.desdeConexionPrivilegiada();
    case "respaldo-estatico":
      return fuentes.catalogoEstatico();
  }
}
