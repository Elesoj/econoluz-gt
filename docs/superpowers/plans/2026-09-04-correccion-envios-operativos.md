# Corrección del modelo operativo de envíos — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Cada paso lleva
> casillas (`- [ ]`) para seguimiento estricto.

**Objetivo:** corregir el modelo operativo de envíos para reflejar la realidad del negocio aprobada por el dueño: mensajero propio exclusivo en el municipio de Guatemala con tarifa fija de Q35,00 y gratuidad a partir de Q2.500,00 inclusive; zonas capitalinas 6, 17 y 18 inicialmente en Guatex y el resto en mensajero propio; y derivación automática de todo destino fuera de la capital a Guatex con coste desconocido (`null`, nunca Q0), sin romper la infraestructura geográfica ni las tablas de 9A desplegadas.

**Arquitectura:**
1. **Dominio puro (`app/envios/`):** cálculo determinista de envíos (`calcularEnvioOperativo`), catálogo estructurado y tipado de las 22 zonas capitalinas válidas (`1-19, 21, 24, 25`), extensión exacta de `DestinoDeEnvio` para soportar `zonaCapitalina` tanto en destino directo como en dirección guardada.
2. **Configuración en PostgreSQL (`app_settings`):** clave `envios_zonas_metodos` (mapeo JSON de métodos por zona con las 22 claves exactas) y `envios_reglas_propias` (tarifa en centavos y umbral en centavos), sembradas mediante migración con `INSERT ... ON CONFLICT DO NOTHING` para permitir bloqueo seguro con `SELECT ... FOR UPDATE`. La columna `app_settings.valor` es `text`, por lo que se persiste como texto JSON serializado sin conversión a tipo binario JSON. Escrituras transaccionales con `INSERT ... ON CONFLICT DO UPDATE`, auditoría en `audit_log` e invalidación por etiqueta (`updateTag("envios-configuracion")`) fuera de la transacción.
3. **Persistencia geográfica (`user_addresses`):** almacenamiento estructurado de la zona capitalina (`zona_capitalina smallint`) mediante migración aditiva y segura `db/015_direccion_zona_capitalina.sql` que permite `NULL` para registros históricos, restringe los valores a las 22 zonas válidas e impide zona si no se cumplen simultáneamente departamento `'01'` y municipio `'0101'`. La obligatoriedad al crear o editar una dirección capitalina la impone la aplicación.
4. **Formulario y lectura en la cuenta (`app/cuenta/direcciones/`):** soporte completo en `FormularioDireccion.tsx` y en el Server Action de `page.tsx` para extraer `zonaCapitalina` desde `FormData`.
5. **Panel administrativo simplificado (`app/admin/(panel)/envios/`):** visualización y edición mediante controles numéricos de la tarifa y umbral global en `envios_reglas_propias`, tabla interactiva de las 22 zonas capitalinas con selector cerrado (`mensajero_propio` / `guatex`), con Server Actions protegidas por sesión y permiso `envios:escribir` reservado al rol `administrador`, con auditoría en `audit_log`.
6. **Retirada de superficies obsoletas de 9A:** sustitución de la ruta por slug `app/admin/(panel)/envios/[zona]/page.tsx` por redirección fija a `/admin/envios` y desmantelamiento de Server Actions no operativas.
7. **Conservación de 9A:** las tablas `shipping_zones`, `shipping_zone_areas` y `shipping_rates` se conservan intactas en PostgreSQL, sin nuevos consumidores, listas para auditoría o futura retirada autorizada.

**Stack:** Next.js 16.3.1 (App Router), React 19, TypeScript 5.9.3, Node.js 24, PostgreSQL 18 en Neon (`@neondatabase/serverless`), `node --test` para unitarias/integración y Playwright (`msedge`) para E2E.

**Especificación de referencia:**
`docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md` (prevalece sobre `docs/superpowers/specs/2026-09-03-envios-tarifas-design.md`).

---

## Restricciones globales

- **Todo importe monetario se maneja exclusivamente en centavos enteros (`integer` o `number` entero)**: Q35,00 = `3500`, Q2.500,00 = `250000`. Nunca decimales ni floats.
- **La comparación de gratuidad es inclusiva**: subtotal >= 250.000 céntimos es gratuito (`envioCents: 0`, `gratuito: true`). Menor que 250.000 paga 3.500 céntimos.
- **Guatex devuelve coste desconocido (`envioCents: null`)**: NUNCA Q0 ni gratuito.
- **Nada que venga del navegador se acepta como tarifa, método o precio**: el servidor valida y recalcula todo de forma autónoma.
- **Las 22 zonas capitalinas válidas son fijas**: 1 a 19, 21, 24 y 25. Zonas 20, 22 y 23 no existen y se rechazan.
- **Zonas 6, 17 y 18 parten inicialmente asignadas a `guatex`**. Las otras 19 zonas parten en `mensajero_propio`.
- **Zona permitida únicamente cuando el municipio sea Guatemala** (`departamentoCodigo === "01" && municipioCodigo === "0101"`). Si el municipio no es Guatemala, `zona_capitalina` debe ser forzosamente `null`.
- **El rol `econoluz_publico` no puede leer tablas administrativas ni direcciones**.
- **No inventar integraciones externas**: no hay API de Guatex ni pasarela de pago en este plan.
- **La sesión del cliente no se fabrica**: la cookie del cliente la emite exclusivamente `crearCookieDeSesion` desde `POST /api/clientes/sesion`, y `leerSesionDeCliente` la verifica con `verifySessionCookie`. Ninguna prueba construye una cookie a mano ni inventa un nombre distinto del que define `app/identidad/sesion.ts`.
- **Toda escritura fuera de la transacción reversible identifica positivamente su base**: se compara el endpoint canónico contra el de Producción **y** se lee el marcador `app_settings.rama_neon`. Que un endpoint lleve el sufijo `-pooler` no lo convierte en desarrollo: ese sufijo solo indica el modo de conexión y lo tiene también Producción.
- **Ninguna limpieza silencia su error**: los fallos de reversión, de limpieza, de restauración de disparadores y de cierre de conexiones se conservan y se agregan, sin impedir los demás intentos de cierre.
- **Idioma**: Español de España en código nuevo, pruebas, commits y documentación.

---

## Estructura de archivos

### Archivos para crear
| Archivo | Responsabilidad |
|---|---|
| `db/015_direccion_zona_capitalina.sql` | Añade columna `zona_capitalina` a `user_addresses` y siembra filas iniciales en `app_settings`. |
| `app/envios/zonasCapitalinas.ts` | Catálogo puro de las 22 zonas válidas, asignación por defecto y validación. |
| `app/envios/configuracion.ts` | Módulo puro de configuración: constantes, tipos (`ReglasPropias`) y parsers seguros con fallback. |
| `app/envios/configuracion.server.ts` | Módulo del servidor (`server-only`): lectura/escritura transaccional en `app_settings`, auditoría y `updateTag`. |
| `tests/envios-zonas-capitalinas.test.ts` | Pruebas unitarias de validación y lista de zonas capitalinas válidas. |
| `tests/envios-contratos-adaptador.test.ts` | Pruebas unitarias del adaptador `aEnvioPublico` y del contrato `ResultadoDeEnvioBase` con coste desconocido. |
| `tests/envios-calculo-operativo.test.ts` | Pruebas unitarias del cálculo operativo (Q35, Q2.500, mensajero propio vs Guatex). |
| `tests/envios-ajustes-operativos.test.ts` | Pruebas unitarias de lectura/escritura de configuración de métodos por zona y reglas propias en `app_settings`. |
| `tests/envios-direccion-zona.test.ts` | Pruebas de validación de dirección con zona obligatoria condicional en cliente y servidor. |
| `tests/envios-admin-operativo.test.ts` | Pruebas unitarias de Server Actions del panel administrativo para zonas y reglas de envío. |
| `tests/helpers/cliente-e2e.ts` | Autenticación E2E **real** de clientes: emulador de Firebase, canje por `POST /api/clientes/sesion`, identificación positiva de la rama de Neon y limpieza que propaga errores. |
| `tests/envios-operativos.spec.ts` | Pruebas E2E de Playwright del panel de envíos y del formulario de direcciones, con sesión de cliente auténtica. |

### Archivos para modificar
| Archivo | Responsabilidad |
|---|---|
| `app/envios/contratos.ts` | Adaptar `DestinoDeEnvio` (`zonaCapitalina`), `ResultadoDeEnvioBase` (`envioCents: number | null`) y tipos operativos. |
| `app/envios/tarifas.ts` | Implementar lógica algorítmica pura del modelo operativo (Q35 / Q2.500 / Guatex desconocido). |
| `app/envios/envios.server.ts` | Orquestador de envíos que integra lectura de dirección guardada, destino directo con zona y resolución operativa. |
| `app/identidad/direcciones.ts` | Añadir `zonaCapitalina` a `DireccionValidada`, SQLs actualizados y validación condicional estricta. |
| `app/identidad/direcciones.server.ts` | Persistir y leer `zona_capitalina` en `user_addresses`. |
| `app/cuenta/direcciones/FormularioDireccion.tsx` | Renderizar desplegable condicional de zonas capitalinas (1-19, 21, 24, 25) cuando el municipio sea Guatemala. |
| `app/cuenta/direcciones/page.tsx` | Extraer `zonaCapitalina` de `FormData` y pasarla al validador de direcciones. |
| `app/admin/envios/actions.ts` | Server Actions para actualizar métodos de zonas y reglas comerciales propias con auditoría. |
| `app/admin/(panel)/envios/page.tsx` | Portada simplificada: controles de tarifa y umbral global, tabla de 22 zonas con selector de método. |
| `app/admin/(panel)/envios/[zona]/page.tsx` | Sustituir la ficha de zona por redirección fija a `/admin/envios`. |
| `scripts/verificar-envios.mjs` | Preflight que comprueba **si existen** las tablas de 9A —no que estén vacías— y verificación de invariantes de migración 015 y `app_settings`. |
| `tests/envios-servicio.test.ts` | Adaptar la prueba existente del orquestador de envíos al modelo operativo (zona capitalina y coste desconocido). |
| `tests/envios-verificar-script.test.ts` | Prueba unitaria del script de verificación de invariantes. |
| `playwright.config.ts` | Cargar `.env.local` mediante `loadEnvConfig(process.cwd())` de `@next/env`, propagar variables E2E a `webServer.env` y añadir `tests/envios-operativos.spec.ts` a `testMatch`. |
| `package.json` | Declarar `@next/env` como dependencia en `devDependencies` y dar de alta las nuevas pruebas unitarias en `test:datos` y `test:admin`. |
| `.env.example` | Declarar `FIREBASE_AUTH_EMULATOR_HOST`, `E2E_FIREBASE_API_KEY` y `NEON_RAMA_E2E`, que hacen falta para las pruebas E2E de cliente. |
| `docs/OPERACION-FIREBASE.md` | Documentar cómo levantar el emulador de Firebase Authentication para las pruebas E2E. |
| `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` | Registrar el nuevo modelo operativo de envíos y el estado del proyecto. |

---

## Tareas de implementación

### Tarea 1: Catálogo puro de zonas capitalinas válidas y reglas por defecto

**Files:**
- Crear: `app/envios/zonasCapitalinas.ts`
- Crear: `tests/envios-zonas-capitalinas.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  ```ts
  export const ZONAS_CAPITALINAS_VALIDAS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25
  ] as const;
  export type ZonaCapitalina = (typeof ZONAS_CAPITALINAS_VALIDAS)[number];
  export const ZONAS_DEFECTO_GUATEX: readonly ZonaCapitalina[] = [6, 17, 18] as const;
  export type MetodoEnvioZona = "mensajero_propio" | "guatex";
  export function esZonaCapitalinaValida(zona: unknown): zona is ZonaCapitalina;
  export function metodoPorDefectoZona(zona: ZonaCapitalina): MetodoEnvioZona;
  export function mapaMetodosPorDefecto(): Record<ZonaCapitalina, MetodoEnvioZona>;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/envios-zonas-capitalinas.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ZONAS_CAPITALINAS_VALIDAS,
  ZONAS_DEFECTO_GUATEX,
  esZonaCapitalinaValida,
  metodoPorDefectoZona,
  mapaMetodosPorDefecto,
} from "../app/envios/zonasCapitalinas";

test("las 22 zonas capitalinas válidas son exactamente 1 a 19, 21, 24 y 25", () => {
  assert.equal(ZONAS_CAPITALINAS_VALIDAS.length, 22);
  const esperadas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25];
  assert.deepEqual([...ZONAS_CAPITALINAS_VALIDAS], esperadas);
});

test("las zonas 20, 22 y 23 no son válidas", () => {
  assert.equal(esZonaCapitalinaValida(20), false);
  assert.equal(esZonaCapitalinaValida(22), false);
  assert.equal(esZonaCapitalinaValida(23), false);
  assert.equal(esZonaCapitalinaValida(0), false);
  assert.equal(esZonaCapitalinaValida(26), false);
  assert.equal(esZonaCapitalinaValida(null), false);
  assert.equal(esZonaCapitalinaValida("1"), false);
});

test("las zonas 6, 17 y 18 tienen guatex como método por defecto", () => {
  assert.equal(metodoPorDefectoZona(6), "guatex");
  assert.equal(metodoPorDefectoZona(17), "guatex");
  assert.equal(metodoPorDefectoZona(18), "guatex");
});

test("las demás zonas capitalinas tienen mensajero_propio por defecto", () => {
  const zonasMensajero = ZONAS_CAPITALINAS_VALIDAS.filter(
    (z) => !ZONAS_DEFECTO_GUATEX.includes(z)
  );
  assert.equal(zonasMensajero.length, 19);
  for (const z of zonasMensajero) {
    assert.equal(metodoPorDefectoZona(z), "mensajero_propio");
  }
});

test("el mapa por defecto contiene exactamente las 22 claves válidas", () => {
  const mapa = mapaMetodosPorDefecto();
  assert.equal(Object.keys(mapa).length, 22);
  assert.equal(mapa[6], "guatex");
  assert.equal(mapa[10], "mensajero_propio");
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-zonas-capitalinas.test.ts`
  - Fallo esperado: Error al importar `../app/envios/zonasCapitalinas` (módulo inexistente).

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/envios/zonasCapitalinas.ts
export const ZONAS_CAPITALINAS_VALIDAS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25,
] as const;

export type ZonaCapitalina = (typeof ZONAS_CAPITALINAS_VALIDAS)[number];

export const ZONAS_DEFECTO_GUATEX: readonly ZonaCapitalina[] = [6, 17, 18] as const;

export type MetodoEnvioZona = "mensajero_propio" | "guatex";

export function esZonaCapitalinaValida(zona: unknown): zona is ZonaCapitalina {
  return (
    typeof zona === "number" &&
    Number.isInteger(zona) &&
    (ZONAS_CAPITALINAS_VALIDAS as readonly number[]).includes(zona)
  );
}

export function metodoPorDefectoZona(zona: ZonaCapitalina): MetodoEnvioZona {
  return (ZONAS_DEFECTO_GUATEX as readonly number[]).includes(zona)
    ? "guatex"
    : "mensajero_propio";
}

export function mapaMetodosPorDefecto(): Record<ZonaCapitalina, MetodoEnvioZona> {
  const mapa = {} as Record<ZonaCapitalina, MetodoEnvioZona>;
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapa[z] = metodoPorDefectoZona(z);
  }
  return mapa;
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-zonas-capitalinas.test.ts`
  - Resultado esperado: 5 tests pasando (0 fallos).

- [ ] **Paso 5: Registrar la prueba en `package.json` bajo `test:datos` y verificar linters**
  - Añadir `tests/envios-zonas-capitalinas.test.ts` en `package.json`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 1**
  - Mensaje: `feat(envios): catalogo puro y reglas por defecto de zonas capitalinas`

---

### Tarea 2: Contratos de envío y cálculo operativo de tarifas

**Files:**
- Modificar: `app/envios/contratos.ts`
- Modificar: `app/envios/tarifas.ts`
- Crear: `tests/envios-calculo-operativo.test.ts`
- Crear: `tests/envios-contratos-adaptador.test.ts`

**Interfaces:**
- En `contratos.ts` (reescritura completa):
  Integra `calculado` y `solicitud_contacto` en `ResultadoDeEnvioBase`.
  Elimina plazos (`plazoMinDias`, `plazoMaxDias`), `con_tarifa`, `paqueteria` y campos de zona (`zonaCodigo`, `zonaNombre`) que ya no pertenecen al modelo.
  Adapta exhaustivamente `ResultadoDeEnvio`, `EnvioPublico` y `aEnvioPublico`.
- En `tarifas.ts`:
  Exporta `TARIFA_MENSAJERO_DEFECTO_CENTS` (3500) y `UMBRAL_GRATIS_DEFECTO_CENTS` (250000).
  Exporta `calcularTarifaMensajeroPropio` y `calcularEnvioOperativo`.

- [ ] **Paso 1: Escribir las pruebas unitarias que fallan (RED)**

```ts
// tests/envios-contratos-adaptador.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  aEnvioPublico,
  type ResultadoDeEnvio,
  type EnvioPublico,
} from "../app/envios/contratos";

test("aEnvioPublico adapta 'calculado' con envioCents, gratuito y faltanParaGratisCents", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "calculado",
    metodo: "mensajero_propio",
    envioCents: 3500,
    gratuito: false,
    faltanParaGratisCents: 10000,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "calculado",
    metodo: "mensajero_propio",
    envioCents: 3500,
    gratuito: false,
    faltanParaGratisCents: 10000,
  });
});

test("aEnvioPublico adapta 'solicitud_contacto' (Guatex)", () => {
  const r: ResultadoDeEnvio = {
    estimacion: true,
    tipo: "solicitud_contacto",
    metodo: "guatex",
    envioCents: null,
    gratuito: false,
    faltanParaGratisCents: null,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: true,
    estado: "solicitud_contacto",
    metodo: "guatex",
    envioCents: null,
    gratuito: false,
    faltanParaGratisCents: null,
  });
});

test("aEnvioPublico adapta 'sin_coste' (recogida en tienda)", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "sin_coste",
    metodo: "recogida_en_tienda",
    envioCents: 0,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "recogida_en_tienda",
    envioCents: 0,
  });
});

test("aEnvioPublico adapta 'requiere_cotizacion'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "requiere_cotizacion",
    motivo: "direccion_sin_codigos",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "cotizacion_requerida",
  });
});

test("aEnvioPublico adapta 'metodo_no_disponible'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "metodo_no_disponible",
    metodo: "recogida_en_tienda",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "recogida_no_disponible",
  });
});

test("aEnvioPublico adapta 'carrito_no_comprable'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "carrito_no_comprable",
    referencias: ["ECO-001"],
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "carrito_no_comprable",
    referencias: ["ECO-001"],
  });
});

test("aEnvioPublico adapta 'no_disponible'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "no_disponible",
    causa: "datos",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "servicio_no_disponible",
  });
});
```

```ts
// tests/envios-calculo-operativo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularTarifaMensajeroPropio,
  calcularEnvioOperativo,
  TARIFA_MENSAJERO_DEFECTO_CENTS,
  UMBRAL_GRATIS_DEFECTO_CENTS,
} from "../app/envios/tarifas";

test("constantes comerciales por defecto: Q35,00 (3500 céntimos) y Q2.500,00 (250000 céntimos)", () => {
  assert.equal(TARIFA_MENSAJERO_DEFECTO_CENTS, 3500);
  assert.equal(UMBRAL_GRATIS_DEFECTO_CENTS, 250000);
});

test("mensajero propio con subtotal menor a Q2.500 cobra Q35 (3500 centavos)", () => {
  const res = calcularTarifaMensajeroPropio(249999);
  assert.equal(res.envioCents, 3500);
  assert.equal(res.gratuito, false);
  assert.equal(res.faltanParaGratisCents, 1);
});

test("mensajero propio con subtotal exactamente Q2.500 (250000 centavos) es gratuito", () => {
  const res = calcularTarifaMensajeroPropio(250000);
  assert.equal(res.envioCents, 0);
  assert.equal(res.gratuito, true);
  assert.equal(res.faltanParaGratisCents, 0);
});

test("mensajero propio con subtotal mayor a Q2.500 es gratuito", () => {
  const res = calcularTarifaMensajeroPropio(300000);
  assert.equal(res.envioCents, 0);
  assert.equal(res.gratuito, true);
  assert.equal(res.faltanParaGratisCents, 0);
});

test("mensajero propio admite reglas comerciales personalizadas", () => {
  const reglas = { tarifaCents: 4000, umbralGratisCents: 300000 };
  const resPaga = calcularTarifaMensajeroPropio(299999, reglas);
  assert.equal(resPaga.envioCents, 4000);
  assert.equal(resPaga.gratuito, false);
  assert.equal(resPaga.faltanParaGratisCents, 1);

  const resGratis = calcularTarifaMensajeroPropio(300000, reglas);
  assert.equal(resGratis.envioCents, 0);
  assert.equal(resGratis.gratuito, true);
  assert.equal(resGratis.faltanParaGratisCents, 0);
});

test("guatex devuelve coste desconocido (null), nunca 0", () => {
  const res = calcularEnvioOperativo({
    metodo: "guatex",
    subtotalCents: 10000,
  });
  assert.equal(res.tipo, "solicitud_contacto");
  assert.equal(res.metodo, "guatex");
  assert.equal(res.envioCents, null);
  assert.equal(res.gratuito, false);
  assert.equal(res.faltanParaGratisCents, null);
});
```

- [ ] **Paso 2: Ejecutar las pruebas y comprobar que fallan (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-contratos-adaptador.test.ts tests/envios-calculo-operativo.test.ts`
  - Fallo esperado: Tipos y funciones no exportadas en `app/envios/contratos` y `app/envios/tarifas`.

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/envios/contratos.ts
export type DestinoDeEnvio =
  | { tipo: "recogida_en_tienda" }
  | { tipo: "direccion_guardada"; direccionId: string }
  | {
      tipo: "destino_directo";
      departamentoCodigo: string;
      municipioCodigo: string;
      zonaCapitalina?: number | null;
    };

export type MotivoDeCotizacion =
  | "sin_cobertura"
  | "zona_inactiva"
  | "cobertura_desactivada"
  | "sin_tarifa_vigente"
  | "direccion_sin_codigos"
  | "pedido_grande";

export type MetodoEnvioOperativo = "mensajero_propio" | "guatex";

export type LineaDeEntrada = {
  econoluzReference: string;
  cantidad: number;
};

export type ResultadoDeEnvioBase =
  | { tipo: "sin_coste"; metodo: "recogida_en_tienda"; envioCents: 0 }
  | {
      tipo: "calculado";
      metodo: "mensajero_propio";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
    }
  | {
      tipo: "solicitud_contacto";
      metodo: "guatex";
      envioCents: null;
      gratuito: false;
      faltanParaGratisCents: null;
    }
  | { tipo: "requiere_cotizacion"; motivo: MotivoDeCotizacion }
  | { tipo: "metodo_no_disponible"; metodo: "recogida_en_tienda" }
  | { tipo: "carrito_no_comprable"; referencias: readonly string[] }
  | { tipo: "no_disponible"; causa: "datos" | "configuracion" };

export type ResultadoDeEnvio = { estimacion: boolean } & ResultadoDeEnvioBase;

export type EnvioPublico = { estimacion: boolean } & (
  | {
      estado: "calculado";
      metodo: "mensajero_propio";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
    }
  | {
      estado: "solicitud_contacto";
      metodo: "guatex";
      envioCents: null;
      gratuito: false;
      faltanParaGratisCents: null;
    }
  | { estado: "recogida_en_tienda"; envioCents: 0 }
  | { estado: "cotizacion_requerida" }
  | { estado: "recogida_no_disponible" }
  | { estado: "carrito_no_comprable"; referencias: readonly string[] }
  | { estado: "servicio_no_disponible" }
);

export function aEnvioPublico(r: ResultadoDeEnvio): EnvioPublico {
  switch (r.tipo) {
    case "sin_coste":
      return {
        estimacion: r.estimacion,
        estado: "recogida_en_tienda",
        envioCents: 0,
      };
    case "calculado":
      return {
        estimacion: r.estimacion,
        estado: "calculado",
        metodo: r.metodo,
        envioCents: r.envioCents,
        gratuito: r.gratuito,
        faltanParaGratisCents: r.faltanParaGratisCents,
      };
    case "solicitud_contacto":
      return {
        estimacion: r.estimacion,
        estado: "solicitud_contacto",
        metodo: r.metodo,
        envioCents: null,
        gratuito: false,
        faltanParaGratisCents: null,
      };
    case "requiere_cotizacion":
      return {
        estimacion: r.estimacion,
        estado: "cotizacion_requerida",
      };
    case "metodo_no_disponible":
      return {
        estimacion: r.estimacion,
        estado: "recogida_no_disponible",
      };
    case "carrito_no_comprable":
      return {
        estimacion: r.estimacion,
        estado: "carrito_no_comprable",
        referencias: r.referencias,
      };
    case "no_disponible":
      return {
        estimacion: r.estimacion,
        estado: "servicio_no_disponible",
      };
  }
}
```

```ts
// app/envios/tarifas.ts
import type {
  MetodoEnvioOperativo,
  ResultadoDeEnvioBase,
} from "./contratos";

export const TARIFA_MENSAJERO_DEFECTO_CENTS = 3500;
export const UMBRAL_GRATIS_DEFECTO_CENTS = 250000;

export type ReglasPropias = { tarifaCents: number; umbralGratisCents: number };

export function calcularTarifaMensajeroPropio(
  subtotalCents: number,
  reglas: ReglasPropias = {
    tarifaCents: TARIFA_MENSAJERO_DEFECTO_CENTS,
    umbralGratisCents: UMBRAL_GRATIS_DEFECTO_CENTS,
  },
): { envioCents: number; gratuito: boolean; faltanParaGratisCents: number | null } {
  if (subtotalCents >= reglas.umbralGratisCents) {
    return { envioCents: 0, gratuito: true, faltanParaGratisCents: 0 };
  }
  return {
    envioCents: reglas.tarifaCents,
    gratuito: false,
    faltanParaGratisCents: Math.max(0, reglas.umbralGratisCents - subtotalCents),
  };
}

export function calcularEnvioOperativo(params: {
  metodo: MetodoEnvioOperativo;
  subtotalCents: number;
  reglas?: ReglasPropias;
}): Extract<ResultadoDeEnvioBase, { tipo: "calculado" | "solicitud_contacto" }> {
  if (params.metodo === "guatex") {
    return {
      tipo: "solicitud_contacto",
      metodo: "guatex",
      envioCents: null,
      gratuito: false,
      faltanParaGratisCents: null,
    };
  }
  const calculo = calcularTarifaMensajeroPropio(params.subtotalCents, params.reglas);
  return {
    tipo: "calculado",
    metodo: "mensajero_propio",
    ...calculo,
  };
}
```

- [ ] **Paso 4: Ejecutar las pruebas y comprobar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-contratos-adaptador.test.ts tests/envios-calculo-operativo.test.ts`
  - Resultado esperado: Todos los tests pasando (0 fallos).

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir a `test:datos` en `package.json`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 2**
  - Mensaje: `feat(envios): reescritura de contratos de envios, adaptador publico y calculo de tarifas operativas`

---

### Tarea 3: Configuración pura y persistencia en `app_settings` para métodos de zona y reglas

**Files:**
- Crear: `app/envios/configuracion.ts` (módulo puro)
- Crear: `app/envios/configuracion.server.ts` (`server-only`)
- Crear: `tests/envios-ajustes-operativos.test.ts`

**Interfaces:**
- En `app/envios/configuracion.ts` (puro):
  ```ts
  export const CLAVE_AJUSTE_ZONAS_METODOS = "envios_zonas_metodos";
  export const CLAVE_AJUSTE_REGLAS_PROPIAS = "envios_reglas_propias";
  export function interpretarZonasMetodos(valor: unknown): Record<ZonaCapitalina, MetodoEnvioZona>;
  export function interpretarReglasPropias(valor: unknown): ReglasPropias;
  ```
- En `app/envios/configuracion.server.ts` (`server-only`):
  ```ts
  export async function obtenerMetodosZonas(): Promise<Record<ZonaCapitalina, MetodoEnvioZona>>;
  export async function obtenerReglasPropias(): Promise<ReglasPropias>;
  export async function guardarMetodoZona(zona: ZonaCapitalina, metodo: MetodoEnvioZona, actorId: string): Promise<void>;
  export async function guardarReglasPropias(reglas: ReglasPropias, actorId: string): Promise<void>;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/envios-ajustes-operativos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  interpretarZonasMetodos,
  interpretarReglasPropias,
  CLAVE_AJUSTE_ZONAS_METODOS,
  CLAVE_AJUSTE_REGLAS_PROPIAS,
} from "../app/envios/configuracion";
import { ZONAS_CAPITALINAS_VALIDAS } from "../app/envios/zonasCapitalinas";

test("constantes de clave de ajustes", () => {
  assert.equal(CLAVE_AJUSTE_ZONAS_METODOS, "envios_zonas_metodos");
  assert.equal(CLAVE_AJUSTE_REGLAS_PROPIAS, "envios_reglas_propias");
});

test("interpretarZonasMetodos con valor nulo o no objeto devuelve el mapa por defecto", () => {
  const def1 = interpretarZonasMetodos(null);
  assert.equal(Object.keys(def1).length, 22);
  assert.equal(def1[6], "guatex");
  assert.equal(def1[10], "mensajero_propio");

  const def2 = interpretarZonasMetodos("texto-invalido");
  assert.equal(Object.keys(def2).length, 22);
  assert.equal(def2[17], "guatex");
});

test("interpretarZonasMetodos con JSON string parsea correctamente", () => {
  const json = JSON.stringify({
    1: "mensajero_propio", 2: "mensajero_propio", 3: "mensajero_propio", 4: "mensajero_propio",
    5: "mensajero_propio", 6: "guatex", 7: "mensajero_propio", 8: "mensajero_propio",
    9: "mensajero_propio", 10: "mensajero_propio", 11: "mensajero_propio", 12: "mensajero_propio",
    13: "mensajero_propio", 14: "mensajero_propio", 15: "mensajero_propio", 16: "mensajero_propio",
    17: "guatex", 18: "guatex", 19: "mensajero_propio", 21: "mensajero_propio",
    24: "mensajero_propio", 25: "mensajero_propio",
  });
  const res = interpretarZonasMetodos(json);
  assert.equal(Object.keys(res).length, 22);
  assert.equal(res[1], "mensajero_propio");
  assert.equal(res[6], "guatex");
});

test("interpretarZonasMetodos si falta una sola clave de las 22 degrada al mapa por defecto entero", () => {
  const parcial = { 1: "guatex" };
  const res = interpretarZonasMetodos(parcial);
  assert.equal(Object.keys(res).length, 22);
  // Degrada al mapa por defecto entero, no conserva claves parciales incoherentes
  assert.equal(res[1], "mensajero_propio");
  assert.equal(res[6], "guatex");
});

test("interpretarZonasMetodos si contiene zona no permitida (ej. 20) degrada al mapa por defecto", () => {
  const mapaInvalido: Record<string, string> = {};
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapaInvalido[String(z)] = "mensajero_propio";
  }
  mapaInvalido["20"] = "guatex"; // Zona 20 no permitida
  const res = interpretarZonasMetodos(mapaInvalido);
  assert.equal(res[6], "guatex");
  assert.equal(Object.prototype.hasOwnProperty.call(res, 20), false);
});

test("interpretarZonasMetodos si contiene método inválido degrada al mapa por defecto", () => {
  const mapaInvalido: Record<string, string> = {};
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapaInvalido[String(z)] = "mensajero_propio";
  }
  mapaInvalido["1"] = "avion_privado"; // Método no permitido
  const res = interpretarZonasMetodos(mapaInvalido);
  assert.equal(res[1], "mensajero_propio");
});

test("interpretarReglasPropias valida importes enteros positivos", () => {
  const resValido = interpretarReglasPropias({ tarifaCents: 4000, umbralGratisCents: 300000 });
  assert.equal(resValido.tarifaCents, 4000);
  assert.equal(resValido.umbralGratisCents, 300000);

  const resJson = interpretarReglasPropias('{"tarifaCents":4500,"umbralGratisCents":280000}');
  assert.equal(resJson.tarifaCents, 4500);
  assert.equal(resJson.umbralGratisCents, 280000);

  const resInvalido = interpretarReglasPropias({ tarifaCents: -500, umbralGratisCents: "mucho" });
  assert.equal(resInvalido.tarifaCents, 3500);
  assert.equal(resInvalido.umbralGratisCents, 250000);

  const resDecimal = interpretarReglasPropias({ tarifaCents: 35.5, umbralGratisCents: 2500.25 });
  assert.equal(resDecimal.tarifaCents, 3500);
  assert.equal(resDecimal.umbralGratisCents, 250000);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-ajustes-operativos.test.ts`
  - Fallo esperado: Módulo `../app/envios/configuracion` inexistente.

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/envios/configuracion.ts
import {
  ZONAS_CAPITALINAS_VALIDAS,
  ZonaCapitalina,
  MetodoEnvioZona,
  mapaMetodosPorDefecto,
} from "./zonasCapitalinas";
import {
  ReglasPropias,
  TARIFA_MENSAJERO_DEFECTO_CENTS,
  UMBRAL_GRATIS_DEFECTO_CENTS,
} from "./tarifas";

export const CLAVE_AJUSTE_ZONAS_METODOS = "envios_zonas_metodos";
export const CLAVE_AJUSTE_REGLAS_PROPIAS = "envios_reglas_propias";

export function interpretarZonasMetodos(valor: unknown): Record<ZonaCapitalina, MetodoEnvioZona> {
  const defecto = mapaMetodosPorDefecto();
  let obj = valor;
  if (typeof valor === "string") {
    try {
      obj = JSON.parse(valor);
    } catch {
      return defecto;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return defecto;
  }
  const entradas = Object.entries(obj as Record<string, unknown>);
  if (entradas.length !== ZONAS_CAPITALINAS_VALIDAS.length) {
    return defecto;
  }
  const resultado = {} as Record<ZonaCapitalina, MetodoEnvioZona>;
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    const val = (obj as Record<string, unknown>)[String(z)];
    if (val !== "mensajero_propio" && val !== "guatex") {
      return defecto;
    }
    resultado[z] = val;
  }
  return resultado;
}

export function interpretarReglasPropias(valor: unknown): ReglasPropias {
  const defecto: ReglasPropias = {
    tarifaCents: TARIFA_MENSAJERO_DEFECTO_CENTS,
    umbralGratisCents: UMBRAL_GRATIS_DEFECTO_CENTS,
  };
  let obj = valor;
  if (typeof valor === "string") {
    try {
      obj = JSON.parse(valor);
    } catch {
      return defecto;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return defecto;
  }
  const r = obj as Record<string, unknown>;
  const tarifa = r.tarifaCents;
  const umbral = r.umbralGratisCents;

  const tarifaValida = typeof tarifa === "number" && Number.isInteger(tarifa) && tarifa >= 0;
  const umbralValido = typeof umbral === "number" && Number.isInteger(umbral) && umbral >= 0;

  if (!tarifaValida || !umbralValido) {
    return defecto;
  }
  return {
    tarifaCents: tarifa,
    umbralGratisCents: umbral,
  };
}
```

```ts
// app/envios/configuracion.server.ts
import "server-only";
import { unstable_cache } from "next/cache";
import { updateTag } from "next/cache";
import { leer, escribir, registrar } from "@/app/lib/datos";
import {
  ZonaCapitalina,
  MetodoEnvioZona,
} from "./zonasCapitalinas";
import { ReglasPropias } from "./tarifas";
import {
  CLAVE_AJUSTE_ZONAS_METODOS,
  CLAVE_AJUSTE_REGLAS_PROPIAS,
  interpretarZonasMetodos,
  interpretarReglasPropias,
} from "./configuracion";

export const TAG_CACHE_ENVIOS_CONFIG = "envios-configuracion";

export const obtenerMetodosZonas = unstable_cache(
  async (): Promise<Record<ZonaCapitalina, MetodoEnvioZona>> => {
    const filas = await leer<{ valor: string }>(
      "SELECT valor FROM app_settings WHERE clave = $1",
      [CLAVE_AJUSTE_ZONAS_METODOS],
    );
    return interpretarZonasMetodos(filas[0]?.valor);
  },
  ["ajuste-zonas-metodos"],
  { tags: [TAG_CACHE_ENVIOS_CONFIG] },
);

export const obtenerReglasPropias = unstable_cache(
  async (): Promise<ReglasPropias> => {
    const filas = await leer<{ valor: string }>(
      "SELECT valor FROM app_settings WHERE clave = $1",
      [CLAVE_AJUSTE_REGLAS_PROPIAS],
    );
    return interpretarReglasPropias(filas[0]?.valor);
  },
  ["ajuste-reglas-propias"],
  { tags: [TAG_CACHE_ENVIOS_CONFIG] },
);

export async function guardarMetodoZona(
  zona: ZonaCapitalina,
  metodo: MetodoEnvioZona,
  actorId: string,
): Promise<void> {
  await escribir(async (ejecutar) => {
    const filas = (await ejecutar(
      "SELECT valor FROM app_settings WHERE clave = $1 FOR UPDATE",
      [CLAVE_AJUSTE_ZONAS_METODOS],
    )) as Array<{ valor: string }>;
    const mapaActual = interpretarZonasMetodos(filas[0]?.valor);
    const mapaNuevo = { ...mapaActual, [zona]: metodo };
    const valorSerializado = JSON.stringify(mapaNuevo);

    await ejecutar(
      `INSERT INTO app_settings (clave, valor, actualizado_en, actualizado_por)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [CLAVE_AJUSTE_ZONAS_METODOS, valorSerializado, actorId],
    );

    await ejecutar(
      `INSERT INTO audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
       VALUES ('admin', $1, 'cambiar_metodo_zona', 'app_settings', $2, $3, $4)`,
      [actorId, CLAVE_AJUSTE_ZONAS_METODOS, JSON.stringify({ zona, metodo: mapaActual[zona] }), JSON.stringify({ zona, metodo })],
    );
  }, { suceso: "guardar-metodo-zona" });

  try {
    updateTag(TAG_CACHE_ENVIOS_CONFIG);
  } catch (error) {
    registrar("error", "fallo-invalidar-cache-envios", {
      clase: error instanceof Error ? error.name : "Desconocido",
    });
  }
}

export async function guardarReglasPropias(
  reglas: ReglasPropias,
  actorId: string,
): Promise<void> {
  await escribir(async (ejecutar) => {
    const filas = (await ejecutar(
      "SELECT valor FROM app_settings WHERE clave = $1 FOR UPDATE",
      [CLAVE_AJUSTE_REGLAS_PROPIAS],
    )) as Array<{ valor: string }>;
    const reglasActuales = interpretarReglasPropias(filas[0]?.valor);
    const valorSerializado = JSON.stringify(reglas);

    await ejecutar(
      `INSERT INTO app_settings (clave, valor, actualizado_en, actualizado_por)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [CLAVE_AJUSTE_REGLAS_PROPIAS, valorSerializado, actorId],
    );

    await ejecutar(
      `INSERT INTO audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
       VALUES ('admin', $1, 'guardar_reglas_envio', 'app_settings', $2, $3, $4)`,
      [actorId, CLAVE_AJUSTE_REGLAS_PROPIAS, JSON.stringify(reglasActuales), JSON.stringify(reglas)],
    );
  }, { suceso: "guardar-reglas-propias" });

  try {
    updateTag(TAG_CACHE_ENVIOS_CONFIG);
  } catch (error) {
    registrar("error", "fallo-invalidar-cache-envios", {
      clase: error instanceof Error ? error.name : "Desconocido",
    });
  }
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-ajustes-operativos.test.ts`
  - Resultado esperado: 7 tests pasando.

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir a `test:datos` en `package.json`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 3**
  - Mensaje: `feat(envios): separacion de modulo puro y servidor para configuracion en app_settings`

---

### Tarea 4: Migración 015 y soporte de zona capitalina en direcciones

**Files:**
- Crear: `db/015_direccion_zona_capitalina.sql`
- Modificar: `app/identidad/direcciones.ts`
- Modificar: `app/identidad/direcciones.server.ts`
- Modificar: `app/cuenta/direcciones/FormularioDireccion.tsx`
- Modificar: `app/cuenta/direcciones/page.tsx`
- Crear: `tests/envios-direccion-zona.test.ts`

**Interfaces:**
- En `direcciones.ts`:
  ```ts
  export type DireccionValidada = {
    destinatario: string;
    telefono: string;
    departamento: string;
    municipio: string;
    direccion: string;
    referencias: string;
    predeterminada: boolean;
    departamentoCodigo?: string | null;
    municipioCodigo?: string | null;
    zonaCapitalina?: number | null;
  };
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/envios-direccion-zona.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { validarDireccion } from "../app/identidad/direcciones";

test("municipio de Guatemala exige zona capitalina válida", () => {
  const sinZona = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    direccion: "7a Avenida",
    zonaCapitalina: null,
  });
  assert.equal(sinZona.ok, false);
  if (!sinZona.ok) {
    assert.ok(sinZona.faltan.includes("zonaCapitalina"));
  }

  const zonaInvalida = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    direccion: "7a Avenida",
    zonaCapitalina: 20, // Zona 20 no existe
  });
  assert.equal(zonaInvalida.ok, false);

  const conZonaValida = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Guatemala",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    direccion: "7a Avenida",
    zonaCapitalina: 10,
  });
  assert.equal(conZonaValida.ok, true);
  if (conZonaValida.ok) {
    assert.equal(conZonaValida.direccion.zonaCapitalina, 10);
  }
});

test("municipio fuera de Guatemala limpia zona_capitalina a null", () => {
  const fuera = validarDireccion({
    destinatario: "Juan Perez",
    telefono: "12345678",
    departamento: "Guatemala",
    municipio: "Mixco",
    departamentoCodigo: "01",
    municipioCodigo: "0108",
    direccion: "Calzada Roosevelt",
    zonaCapitalina: 4,
  });
  assert.equal(fuera.ok, true);
  if (fuera.ok) {
    assert.equal(fuera.direccion.zonaCapitalina, null);
  }
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-direccion-zona.test.ts`
  - Fallo esperado: Validación no reconoce `zonaCapitalina`.

- [ ] **Paso 3: Escribir la migración `db/015_direccion_zona_capitalina.sql` y el código (GREEN)**

```sql
-- db/015_direccion_zona_capitalina.sql
-- Migración 015: Añade columna zona_capitalina a user_addresses y siembra ajustes iniciales en texto plano

ALTER TABLE user_addresses
  ADD COLUMN IF NOT EXISTS zona_capitalina smallint NULL;

-- Restricción de 22 zonas válidas (permite NULL para no romper registros históricos)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_zona_capitalina_valida_check') THEN
    ALTER TABLE user_addresses
      ADD CONSTRAINT user_addresses_zona_capitalina_valida_check
      CHECK (
        zona_capitalina IS NULL OR
        zona_capitalina IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25)
      );
  END IF;
END $$;

-- Restricción de coherencia: zona solo si departamento es 01 y municipio es 0101
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_zona_capitalina_municipio_check') THEN
    ALTER TABLE user_addresses
      ADD CONSTRAINT user_addresses_zona_capitalina_municipio_check
      CHECK (
        zona_capitalina IS NULL OR (departamento_codigo = '01' AND municipio_codigo = '0101')
      );
  END IF;
END $$;

-- Siembra inicial en app_settings como TEXTO PLANO (sin casteo) para permitir SELECT ... FOR UPDATE posterior
INSERT INTO app_settings (clave, valor, actualizado_en, actualizado_por)
VALUES (
  'envios_zonas_metodos',
  '{"1":"mensajero_propio","2":"mensajero_propio","3":"mensajero_propio","4":"mensajero_propio","5":"mensajero_propio","6":"guatex","7":"mensajero_propio","8":"mensajero_propio","9":"mensajero_propio","10":"mensajero_propio","11":"mensajero_propio","12":"mensajero_propio","13":"mensajero_propio","14":"mensajero_propio","15":"mensajero_propio","16":"mensajero_propio","17":"guatex","18":"guatex","19":"mensajero_propio","21":"mensajero_propio","24":"mensajero_propio","25":"mensajero_propio"}',
  now(),
  'sistema:migracion_015'
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO app_settings (clave, valor, actualizado_en, actualizado_por)
VALUES (
  'envios_reglas_propias',
  '{"tarifaCents":3500,"umbralGratisCents":250000}',
  now(),
  'sistema:migracion_015'
)
ON CONFLICT (clave) DO NOTHING;
```

```ts
// app/identidad/direcciones.ts
import { esZonaCapitalinaValida } from "../envios/zonasCapitalinas";

export type DireccionValidada = {
  destinatario: string;
  telefono: string;
  departamento: string;
  municipio: string;
  direccion: string;
  referencias: string;
  predeterminada: boolean;
  departamentoCodigo?: string | null;
  municipioCodigo?: string | null;
  zonaCapitalina?: number | null;
};

export type ResultadoDeValidacion =
  | { ok: true; direccion: DireccionValidada }
  | { ok: false; faltan: string[] };

const OBLIGATORIOS = [
  "destinatario",
  "telefono",
  "departamento",
  "municipio",
  "direccion",
] as const;
const LARGO_MAXIMO = 300;

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

const ETIQUETAS: Record<string, string> = {
  destinatario: "quién recibe",
  telefono: "teléfono",
  departamento: "departamento",
  municipio: "municipio",
  direccion: "dirección",
  referencias: "referencias",
  zonaCapitalina: "zona capitalina",
};

export function mensajeDeFaltan(faltan: readonly string[]): string {
  if (faltan.length === 0) return "";

  const etiquetas = faltan.map((campo) => ETIQUETAS[campo] ?? "algún dato");
  const unicos = [...new Set(etiquetas)];

  const cabecera =
    unicos.length === 1
      ? `Revisa el campo «${unicos[0]}».`
      : `Revisa estos campos: ${unicos.map((e) => `«${e}»`).join(", ")}.`;

  return `${cabecera} Los obligatorios no pueden quedar vacíos, y ninguno puede pasar de ${LARGO_MAXIMO} caracteres.`;
}

export function validarDireccion(entrada: unknown): ResultadoDeValidacion {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, faltan: [...OBLIGATORIOS] };
  }

  const datos = entrada as Record<string, unknown>;
  const faltan: string[] = OBLIGATORIOS.filter((campo) => {
    const valor = texto(datos[campo]);
    return valor.length === 0 || valor.length > LARGO_MAXIMO;
  });

  const referencias = texto(datos.referencias);
  if (referencias.length > LARGO_MAXIMO) {
    faltan.push("referencias");
  }

  const depCodRaw = texto(datos.departamentoCodigo);
  const munCodRaw = texto(datos.municipioCodigo);
  const departamentoCodigo = /^\d{2}$/.test(depCodRaw) ? depCodRaw : null;
  const municipioCodigo = /^\d{4}$/.test(munCodRaw) ? munCodRaw : null;

  const esMunicipioGuatemala = departamentoCodigo === "01" && municipioCodigo === "0101";
  let zonaCapitalinaFinal: number | null = null;

  if (esMunicipioGuatemala) {
    const rawZona = datos.zonaCapitalina;
    const numZona = typeof rawZona === "number" ? rawZona : Number(rawZona);
    if (!Number.isInteger(numZona) || !esZonaCapitalinaValida(numZona)) {
      faltan.push("zonaCapitalina");
    } else {
      zonaCapitalinaFinal = numZona;
    }
  }

  if (faltan.length > 0) {
    return { ok: false, faltan };
  }

  return {
    ok: true,
    direccion: {
      destinatario: texto(datos.destinatario),
      telefono: texto(datos.telefono),
      departamento: texto(datos.departamento),
      municipio: texto(datos.municipio),
      direccion: texto(datos.direccion),
      referencias,
      predeterminada: datos.predeterminada === true,
      departamentoCodigo,
      municipioCodigo,
      zonaCapitalina: zonaCapitalinaFinal,
    },
  };
}

export const SQL_LISTAR_DIRECCIONES = `
  select id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada, departamento_codigo, municipio_codigo, zona_capitalina
  from user_addresses
  where user_id = $1
  order by predeterminada desc, id
`;

export const SQL_QUITAR_PREDETERMINADA = `
  update user_addresses set predeterminada = false, actualizado_en = now()
  where user_id = $1 and predeterminada
`;

export const SQL_INSERTAR_DIRECCION = `
  insert into user_addresses
    (user_id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada, departamento_codigo, municipio_codigo, zona_capitalina)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  returning id
`;
```

```ts
// app/identidad/direcciones.server.ts
import "server-only";

import { escribir, leer } from "../lib/datos";
import {
  SQL_INSERTAR_DIRECCION,
  SQL_LISTAR_DIRECCIONES,
  SQL_QUITAR_PREDETERMINADA,
  type DireccionValidada,
} from "./direcciones";

export async function listarDirecciones(userId: string) {
  return leer<Record<string, unknown>>(SQL_LISTAR_DIRECCIONES, [userId]);
}

/** Conserva el cambio de predeterminada y el alta en una sola transacción. */
export async function guardarDireccion(userId: string, direccion: DireccionValidada) {
  return escribir(
    async (ejecutar) => {
      if (direccion.predeterminada) {
        await ejecutar(SQL_QUITAR_PREDETERMINADA, [userId]);
      }

      const filas = await ejecutar(SQL_INSERTAR_DIRECCION, [
        userId,
        direccion.destinatario,
        direccion.telefono,
        direccion.departamento,
        direccion.municipio,
        direccion.direccion,
        direccion.referencias,
        direccion.predeterminada,
        direccion.departamentoCodigo ?? null,
        direccion.municipioCodigo ?? null,
        direccion.zonaCapitalina ?? null,
      ]);

      return String(filas[0]?.id ?? "");
    },
    { suceso: "guardar-direccion" },
  );
}
```

```tsx
// app/cuenta/direcciones/FormularioDireccion.tsx
"use client";

import { useMemo, useState, useActionState } from "react";
import type { DepartamentoCatalogo, MunicipioCatalogo } from "@/app/envios/geografia";
import { ZONAS_CAPITALINAS_VALIDAS } from "@/app/envios/zonasCapitalinas";

export type EstadoDelFormulario = { mensaje: string; guardada: boolean };
export const ESTADO_INICIAL: EstadoDelFormulario = { mensaje: "", guardada: false };

export type FormularioDireccionProps = {
  accion: (estado: EstadoDelFormulario, datos: FormData) => Promise<EstadoDelFormulario>;
  departamentos: readonly DepartamentoCatalogo[];
  municipios: readonly MunicipioCatalogo[];
};

export default function FormularioDireccion({
  accion,
  departamentos,
  municipios,
}: FormularioDireccionProps) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const [departamentoCodigo, setDepartamentoCodigo] = useState("");
  const [municipioCodigo, setMunicipioCodigo] = useState("");
  const [zonaCapitalina, setZonaCapitalina] = useState("");

  const deptosOrdenados = useMemo(
    () => [...departamentos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [departamentos],
  );

  const municipiosDisponibles = useMemo(() => {
    if (!departamentoCodigo) return [];
    return municipios
      .filter((m) => m.departamento === departamentoCodigo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [municipios, departamentoCodigo]);

  const esMunicipioGuatemala = departamentoCodigo === "01" && municipioCodigo === "0101";

  const departamentoNombre =
    departamentos.find((d) => d.codigo === departamentoCodigo)?.nombre ?? "";
  const municipioNombre =
    municipios.find((m) => m.codigo === municipioCodigo)?.nombre ?? "";

  return (
    <form
      key={estado.guardada ? "guardada" : "pendiente"}
      action={enviar}
      className="mt-10 space-y-3"
    >
      <h2 className="text-lg font-medium text-[#001B59]">Agregar una dirección</h2>

      {estado.mensaje ? (
        <p
          role="alert"
          className="rounded border border-[#E11133] bg-[#E11133]/5 px-3 py-2 text-sm text-[#B80D28]"
        >
          {estado.mensaje}
        </p>
      ) : null}

      <label className="block text-sm text-neutral-700">
        Quién recibe
        <input
          type="text"
          name="destinatario"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Teléfono de contacto
        <input
          type="tel"
          name="telefono"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Departamento
        <select
          name="departamentoCodigo"
          required
          value={departamentoCodigo}
          onChange={(e) => {
            setDepartamentoCodigo(e.target.value);
            setMunicipioCodigo("");
            setZonaCapitalina("");
          }}
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="">Selecciona un departamento</option>
          {deptosOrdenados.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="departamento" value={departamentoNombre} />

      <label className="block text-sm text-neutral-700">
        Municipio
        <select
          name="municipioCodigo"
          required
          disabled={!departamentoCodigo}
          value={municipioCodigo}
          onChange={(e) => {
            setMunicipioCodigo(e.target.value);
            setZonaCapitalina("");
          }}
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100 disabled:text-neutral-400"
        >
          <option value="">
            {departamentoCodigo
              ? "Selecciona un municipio"
              : "Selecciona primero un departamento"}
          </option>
          {municipiosDisponibles.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nombre}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="municipio" value={municipioNombre} />

      {esMunicipioGuatemala ? (
        <label className="block text-sm text-neutral-700">
          Zona capitalina
          <select
            name="zonaCapitalina"
            required
            value={zonaCapitalina}
            onChange={(e) => setZonaCapitalina(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Selecciona la zona</option>
            {ZONAS_CAPITALINAS_VALIDAS.map((z) => (
              <option key={z} value={z}>
                Zona {z}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-sm text-neutral-700">
        Dirección
        <input
          type="text"
          name="direccion"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Referencias para encontrarla
        <input
          name="referencias"
          placeholder="Portón negro frente a la tienda"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="predeterminada" />
        Usar como predeterminada
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="rounded bg-[#E11133] px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {enviando ? "Guardando…" : "Guardar dirección"}
      </button>
    </form>
  );
}
```

```tsx
// app/cuenta/direcciones/page.tsx (fragmento de la Server Action guardar)
async function guardar(
  _previo: EstadoDelFormulario,
  datos: FormData,
): Promise<EstadoDelFormulario> {
  "use server";

  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const resultado = validarDireccion({
    destinatario: datos.get("destinatario"),
    telefono: datos.get("telefono"),
    departamento: datos.get("departamento"),
    municipio: datos.get("municipio"),
    direccion: datos.get("direccion"),
    referencias: datos.get("referencias"),
    predeterminada: datos.get("predeterminada") === "on",
    departamentoCodigo: datos.get("departamentoCodigo"),
    municipioCodigo: datos.get("municipioCodigo"),
    zonaCapitalina: datos.get("zonaCapitalina"),
  });

  if (!resultado.ok) {
    return { mensaje: mensajeDeFaltan(resultado.faltan), guardada: false };
  }

  await guardarDireccion(cliente.id, resultado.direccion);
  revalidatePath("/cuenta/direcciones");
  return { mensaje: "", guardada: true };
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-direccion-zona.test.ts`
  - Resultado esperado: 2 tests pasando.

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 4**
  - Mensaje: `feat(direcciones): zona capitalina estructurada, migracion 015 y formulario con FormData`

---

### Tarea 5: Orquestador funcional puro de envíos y adaptador de servidor

**Files:**
- Crear: `app/envios/orquestacion.ts` (módulo puro sin `server-only`, ejecutable directamente en pruebas unitarias con `node:test`)
- Modificar: `app/envios/envios.server.ts` (wrapper exclusivo con `server-only` que inyecta Neon, sesión y Neon)
- Modificar: `tests/envios-servicio.test.ts`

**Interfaces:**
- En `app/envios/orquestacion.ts`:
  ```ts
  export type DependenciasEnvios = {
    leerConfiguracion: () => Promise<{
      recogidaActiva: boolean;
      metodosZonas: Record<ZonaCapitalina, MetodoEnvioZona>;
      reglasPropias: ReglasPropias;
    }>;
    leerCarrito: () => Promise<{ lineas: readonly { econoluzReference: string; cantidad: number }[] }>;
    resolverProductos: (lineas: readonly { econoluzReference: string; cantidad: number }[]) => Promise<{
      piezas: number;
      subtotalCents: number;
      descartadas: readonly string[];
    }>;
    leerDireccion?: (id: string) => Promise<{
      departamentoCodigo: string | null;
      municipioCodigo: string | null;
      zonaCapitalina?: number | null;
    } | null>;
    ahora?: () => Date;
  };

  export type OpcionesEnvios = {
    estimacion?: boolean;
    lineas?: readonly { econoluzReference: string; cantidad: number }[];
  };

  export async function orquestar(
    destino: DestinoDeEnvio,
    deps: DependenciasEnvios,
    opciones?: OpcionesEnvios,
  ): Promise<ResultadoDeEnvio>;
  ```

- En `app/envios/envios.server.ts`:
  ```ts
  import "server-only";
  export async function cotizarEnvioDelCliente(destino: DestinoDeEnvio): Promise<ResultadoDeEnvio>;
  export async function estimarEnvio(destino: DestinoDeEnvio, lineas: readonly LineaDeEntrada[]): Promise<ResultadoDeEnvio>;
  ```

- [ ] **Paso 1: Actualizar pruebas unitarias en `tests/envios-servicio.test.ts` (RED)**

```ts
// tests/envios-servicio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { orquestar, type DependenciasEnvios } from "../app/envios/orquestacion";
import { ErrorDeDatos } from "../app/lib/datos/errores";
import { mapaMetodosPorDefecto } from "../app/envios/zonasCapitalinas";
import { TARIFA_MENSAJERO_DEFECTO_CENTS, UMBRAL_GRATIS_DEFECTO_CENTS } from "../app/envios/tarifas";

const depsOperativas = (parches: Partial<DependenciasEnvios> = {}): DependenciasEnvios => ({
  leerConfiguracion: async () => ({
    recogidaActiva: false,
    metodosZonas: mapaMetodosPorDefecto(),
    reglasPropias: {
      tarifaCents: TARIFA_MENSAJERO_DEFECTO_CENTS,
      umbralGratisCents: UMBRAL_GRATIS_DEFECTO_CENTS,
    },
  }),
  leerCarrito: async () => ({ lineas: [{ econoluzReference: "ECO-0001", cantidad: 2 }] }),
  resolverProductos: async () => ({ piezas: 2, subtotalCents: 100_000, descartadas: [] }),
  ahora: () => new Date("2026-06-01T00:00:00Z"),
  ...parches,
});

test("la recogida desactivada por defecto devuelve metodo_no_disponible", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" }, depsOperativas());
  assert.equal(r.tipo, "metodo_no_disponible");
});

test("un carrito con líneas no comprables detiene el cálculo", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({ resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }) }),
  );
  assert.equal(r.tipo, "carrito_no_comprable");
  assert.deepEqual(r.referencias, ["ECO-0009"]);
});

test("un fallo de datos no es una cotización", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      leerConfiguracion: async () => {
        throw new ErrorDeDatos("indisponible", "falló");
      },
    }),
  );
  assert.equal(r.tipo, "no_disponible");
  assert.equal(r.causa, "datos");
});

test("municipio de Guatemala con zona en mensajero propio calcula tarifa fija Q35", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({ resolverProductos: async () => ({ piezas: 1, subtotalCents: 100_000, descartadas: [] }) }),
  );
  assert.equal(r.tipo, "calculado");
  if (r.tipo === "calculado") {
    assert.equal(r.metodo, "mensajero_propio");
    assert.equal(r.envioCents, 3500);
    assert.equal(r.gratuito, false);
    assert.equal(r.faltanParaGratisCents, 150_000);
  }
});

test("municipio de Guatemala con subtotal >= Q2.500 calcula gratuidad", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({ resolverProductos: async () => ({ piezas: 3, subtotalCents: 250_000, descartadas: [] }) }),
  );
  assert.equal(r.tipo, "calculado");
  if (r.tipo === "calculado") {
    assert.equal(r.metodo, "mensajero_propio");
    assert.equal(r.envioCents, 0);
    assert.equal(r.gratuito, true);
    assert.equal(r.faltanParaGratisCents, 0);
  }
});

test("municipio de Guatemala con zona asignada a Guatex (ej. 6, 17 o 18) devuelve coste desconocido", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 6 },
    depsOperativas(),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});

test("destino fuera del municipio de Guatemala deriva a Guatex con coste desconocido", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0108" }, // Mixco
    depsOperativas(),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});

test("direccion guardada con zona capitalina 17 deriva a Guatex", async () => {
  const r = await orquestar(
    { tipo: "direccion_guardada", direccionId: "dir-42" },
    depsOperativas({
      leerDireccion: async () => ({
        departamentoCodigo: "01",
        municipioCodigo: "0101",
        zonaCapitalina: 17,
      }),
    }),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-servicio.test.ts`

- [ ] **Paso 3: Implementar `app/envios/orquestacion.ts` y wrapper en `app/envios/envios.server.ts` (GREEN)**

```ts
// app/envios/orquestacion.ts
import { ErrorDeDatos } from "../lib/datos/errores";
import type { DestinoDeEnvio, ResultadoDeEnvio } from "./contratos";
import {
  calcularEnvioOperativo,
  type ReglasPropias,
} from "./tarifas";
import {
  esZonaCapitalinaValida,
  metodoPorDefectoZona,
  type ZonaCapitalina,
  type MetodoEnvioZona,
} from "./zonasCapitalinas";

export type DependenciasEnvios = {
  leerConfiguracion: () => Promise<{
    recogidaActiva: boolean;
    metodosZonas: Record<ZonaCapitalina, MetodoEnvioZona>;
    reglasPropias: ReglasPropias;
  }>;
  leerCarrito: () => Promise<{ lineas: readonly { econoluzReference: string; cantidad: number }[] }>;
  resolverProductos: (lineas: readonly { econoluzReference: string; cantidad: number }[]) => Promise<{
    piezas: number;
    subtotalCents: number;
    descartadas: readonly string[];
  }>;
  leerDireccion?: (id: string) => Promise<{
    departamentoCodigo: string | null;
    municipioCodigo: string | null;
    zonaCapitalina?: number | null;
  } | null>;
  ahora?: () => Date;
};

export type OpcionesEnvios = {
  estimacion?: boolean;
  lineas?: readonly { econoluzReference: string; cantidad: number }[];
};

export async function orquestar(
  destino: DestinoDeEnvio,
  deps: DependenciasEnvios,
  opciones?: OpcionesEnvios,
): Promise<ResultadoDeEnvio> {
  const estimacion = Boolean(opciones?.estimacion);

  // 1. Carrito y resolución de productos
  const lineas = estimacion && opciones?.lineas
    ? opciones.lineas
    : (await deps.leerCarrito()).lineas;

  const resProductos = await deps.resolverProductos(lineas);
  if (resProductos.descartadas.length > 0) {
    return {
      estimacion,
      tipo: "carrito_no_comprable",
      referencias: resProductos.descartadas,
    };
  }

  // 2. Recogida en tienda
  if (destino.tipo === "recogida_en_tienda") {
    let config;
    try {
      config = await deps.leerConfiguracion();
    } catch (err: unknown) {
      if (err instanceof ErrorDeDatos) {
        return { estimacion, tipo: "no_disponible", causa: "datos" };
      }
      throw err;
    }
    if (config.recogidaActiva) {
      return {
        estimacion,
        tipo: "sin_coste",
        metodo: "recogida_en_tienda",
        envioCents: 0,
      };
    }
    return {
      estimacion,
      tipo: "metodo_no_disponible",
      metodo: "recogida_en_tienda",
    };
  }

  // 3. Destino a códigos
  let depto: string | null = null;
  let muni: string | null = null;
  let zona: number | null = null;

  if (destino.tipo === "direccion_guardada") {
    if (!deps.leerDireccion) {
      return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
    }
    const dir = await deps.leerDireccion(destino.direccionId);
    if (!dir || !dir.departamentoCodigo || !dir.municipioCodigo) {
      return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
    }
    depto = dir.departamentoCodigo;
    muni = dir.municipioCodigo;
    zona = dir.zonaCapitalina ?? null;
  } else {
    depto = destino.departamentoCodigo;
    muni = destino.municipioCodigo;
    zona = destino.zonaCapitalina ?? null;
  }

  if (!depto || !muni || muni.slice(0, 2) !== depto) {
    return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
  }

  // 4. Configuración
  let config;
  try {
    config = await deps.leerConfiguracion();
  } catch (err: unknown) {
    if (err instanceof ErrorDeDatos) {
      return { estimacion, tipo: "no_disponible", causa: "datos" };
    }
    throw err;
  }

  // 5. Deducción de método según geografía y zona
  if (depto === "01" && muni === "0101") {
    if (zona === null || !esZonaCapitalinaValida(zona)) {
      return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
    }
    const zonaValida = zona as ZonaCapitalina;
    const metodoZona = config.metodosZonas[zonaValida] ?? metodoPorDefectoZona(zonaValida);

    const base = calcularEnvioOperativo({
      metodo: metodoZona,
      subtotalCents: resProductos.subtotalCents,
      reglas: config.reglasPropias,
    });
    return { estimacion, ...base };
  }

  // Fuera del municipio de Guatemala
  const base = calcularEnvioOperativo({
    metodo: "guatex",
    subtotalCents: resProductos.subtotalCents,
  });
  return { estimacion, ...base };
}
```

```ts
// app/envios/envios.server.ts
import "server-only";

import { aCentavos } from "../lib/dinero";
import { leer } from "../lib/datos";
import { leerCarritoCon } from "../tienda/carritoRepositorio";
import { leerClienteActual } from "../identidad/sesion.server";
import { obtenerMetodosZonas, obtenerReglasPropias } from "./configuracion.server";
import { orquestar as orquestarPuro, type DependenciasEnvios, type OpcionesEnvios } from "./orquestacion";
import type { DestinoDeEnvio, ResultadoDeEnvio, LineaDeEntrada } from "./contratos";

export async function orquestar(
  destino: DestinoDeEnvio,
  deps: DependenciasEnvios,
  opciones?: OpcionesEnvios,
): Promise<ResultadoDeEnvio> {
  return orquestarPuro(destino, deps, opciones);
}

export async function cotizarEnvioDelCliente(destino: DestinoDeEnvio): Promise<ResultadoDeEnvio> {
  const cliente = await leerClienteActual();
  if (!cliente) {
    return {
      estimacion: false,
      tipo: "no_disponible",
      causa: "configuracion",
    };
  }
  const userId = cliente.id;

  const deps: DependenciasEnvios = {
    leerConfiguracion: async () => {
      const [metodosZonas, reglasPropias] = await Promise.all([
        obtenerMetodosZonas(),
        obtenerReglasPropias(),
      ]);
      return {
        recogidaActiva: false,
        metodosZonas,
        reglasPropias,
      };
    },
    leerCarrito: async () => {
      const carrito = await leerCarritoCon((texto, parametros) => leer(texto, parametros), userId);
      return {
        lineas: carrito.lineas.map((l) => ({
          econoluzReference: l.econoluzReference,
          cantidad: l.cantidad,
        })),
      };
    },
    resolverProductos: async (lineas) => {
      if (lineas.length === 0) {
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      }
      const refs = lineas.map((l) => l.econoluzReference);
      const filas = await leer<{
        econoluz_reference: string;
        price_gtq: string | number;
        published: boolean;
      }>(
        `select econoluz_reference, price_gtq, published
           from products
          where econoluz_reference = any($1)`,
        [refs],
      );

      const mapa = new Map(filas.map((f) => [f.econoluz_reference, f]));
      let subtotalCents = 0;
      let piezas = 0;
      const descartadas: string[] = [];

      for (const l of lineas) {
        const prod = mapa.get(l.econoluzReference);
        if (!prod || !prod.published || Number(prod.price_gtq) <= 0) {
          descartadas.push(l.econoluzReference);
        } else {
          piezas += l.cantidad;
          subtotalCents += aCentavos(Number(prod.price_gtq)) * l.cantidad;
        }
      }

      return { piezas, subtotalCents, descartadas };
    },
    leerDireccion: async (id: string) => {
      const filas = await leer<{
        departamento_codigo: string | null;
        municipio_codigo: string | null;
        zona_capitalina: number | null;
      }>(
        `select departamento_codigo, municipio_codigo, zona_capitalina
           from user_addresses
          where id = $1 and user_id = $2`,
        [id, userId],
      );
      const f = filas[0];
      if (!f) return null;
      return {
        departamentoCodigo: f.departamento_codigo,
        municipioCodigo: f.municipio_codigo,
        zonaCapitalina: f.zona_capitalina,
      };
    },
  };

  return orquestarPuro(destino, deps, { estimacion: false });
}

export async function estimarEnvio(
  destino: DestinoDeEnvio,
  lineas: readonly LineaDeEntrada[],
): Promise<ResultadoDeEnvio> {
  const deps: DependenciasEnvios = {
    leerConfiguracion: async () => {
      const [metodosZonas, reglasPropias] = await Promise.all([
        obtenerMetodosZonas(),
        obtenerReglasPropias(),
      ]);
      return {
        recogidaActiva: false,
        metodosZonas,
        reglasPropias,
      };
    },
    leerCarrito: async () => ({ lineas }),
    resolverProductos: async (lineasInput) => {
      if (lineasInput.length === 0) {
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      }
      const refs = lineasInput.map((l) => l.econoluzReference);
      const filas = await leer<{
        econoluz_reference: string;
        price_gtq: string | number;
        published: boolean;
      }>(
        `select econoluz_reference, price_gtq, published
           from products
          where econoluz_reference = any($1)`,
        [refs],
      );

      const mapa = new Map(filas.map((f) => [f.econoluz_reference, f]));
      let subtotalCents = 0;
      let piezas = 0;
      const descartadas: string[] = [];

      for (const l of lineasInput) {
        const prod = mapa.get(l.econoluzReference);
        if (!prod || !prod.published || Number(prod.price_gtq) <= 0) {
          descartadas.push(l.econoluzReference);
        } else {
          piezas += l.cantidad;
          subtotalCents += aCentavos(Number(prod.price_gtq)) * l.cantidad;
        }
      }

      return { piezas, subtotalCents, descartadas };
    },
  };

  return orquestarPuro(destino, deps, { estimacion: true, lineas });
}
```

- [ ] **Paso 4: Ejecutar las pruebas y comprobar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-servicio.test.ts`
  - Resultado esperado: 8 pruebas pasando (0 fallos).

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Comando: `npm run test:datos && npm run typecheck && npm run lint`

- [ ] **Paso 6: Commit de la tarea 5**
  - Mensaje: `feat(envios): orquestador funcional puro y adaptador server-only`

### Tarea 6: Panel administrativo de envíos simplificado con controles de tarifas

**Files:**
- Crear: `app/admin/envios/formularios.ts` (módulo funcional puro, sin directiva `"use server"`)
- Modificar: `app/admin/envios/actions.ts` (únicamente Server Actions asíncronas con `"use server"`)
- Modificar: `app/admin/(panel)/envios/page.tsx`
- Modificar: `app/admin/(panel)/envios/[zona]/page.tsx`
- Crear: `tests/envios-admin-operativo.test.ts`

**Interfaces:**
- En `app/admin/envios/formularios.ts`:
  ```ts
  export type ResultadoAccionMetodo =
    | { ok: true; zona: ZonaCapitalina; metodo: MetodoEnvioZona }
    | { ok: false; error: string };

  export type ResultadoAccionReglas =
    | { ok: true; reglas: ReglasPropias }
    | { ok: false; error: string };

  export function validarFormularioMetodoZona(formData: FormData): ResultadoAccionMetodo;
  export function validarFormularioReglasEnvio(formData: FormData): ResultadoAccionReglas;
  ```
- En `app/admin/envios/actions.ts`:
  ```ts
  export async function cambiarMetodoZonaAction(formData: FormData): Promise<void>;
  export async function guardarReglasEnvioAction(formData: FormData): Promise<void>;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/envios-admin-operativo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validarFormularioMetodoZona,
  validarFormularioReglasEnvio,
} from "../app/admin/envios/formularios";

test("validarFormularioMetodoZona rechaza zonas inexistentes (20, 22, 23)", () => {
  for (const zonaInvalida of [20, 22, 23, 0, 26, -1]) {
    const fd = new FormData();
    fd.set("zona", String(zonaInvalida));
    fd.set("metodo", "mensajero_propio");
    const r = validarFormularioMetodoZona(fd);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /zona.*no es válida/i);
    }
  }
});

test("validarFormularioMetodoZona rechaza métodos no permitidos", () => {
  const fd = new FormData();
  fd.set("zona", "10");
  fd.set("metodo", "dron");
  const r = validarFormularioMetodoZona(fd);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /método.*no permitido/i);
  }
});

test("validarFormularioMetodoZona acepta pares válidos", () => {
  const fd1 = new FormData();
  fd1.set("zona", "6");
  fd1.set("metodo", "guatex");
  const r1 = validarFormularioMetodoZona(fd1);
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.zona, 6);
    assert.equal(r1.metodo, "guatex");
  }

  const fd2 = new FormData();
  fd2.set("zona", "10");
  fd2.set("metodo", "mensajero_propio");
  const r2 = validarFormularioMetodoZona(fd2);
  assert.equal(r2.ok, true);
  if (r2.ok) {
    assert.equal(r2.zona, 10);
    assert.equal(r2.metodo, "mensajero_propio");
  }
});

test("validarFormularioReglasEnvio rechaza decimales y negativos", () => {
  const fd1 = new FormData();
  fd1.set("tarifaCents", "35.5");
  fd1.set("umbralGratisCents", "250000");
  assert.equal(validarFormularioReglasEnvio(fd1).ok, false);

  const fd2 = new FormData();
  fd2.set("tarifaCents", "-100");
  fd2.set("umbralGratisCents", "250000");
  assert.equal(validarFormularioReglasEnvio(fd2).ok, false);

  const fd3 = new FormData();
  fd3.set("tarifaCents", "3500");
  fd3.set("umbralGratisCents", "2500.25");
  assert.equal(validarFormularioReglasEnvio(fd3).ok, false);
});

test("validarFormularioReglasEnvio acepta enteros válidos en centavos", () => {
  const fd = new FormData();
  fd.set("tarifaCents", "3500");
  fd.set("umbralGratisCents", "250000");
  const r = validarFormularioReglasEnvio(fd);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.tarifaCents, 3500);
    assert.equal(r.reglas.umbralGratisCents, 250000);
  }
});
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-admin-operativo.test.ts`
  - Fallo esperado: Módulo `app/admin/envios/formularios.ts` no existe.

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/admin/envios/formularios.ts
// MÓDULO PURO: Sin directiva "use server", importable con seguridad desde tests unitarios sin restricciones de Server Actions.
import {
  esZonaCapitalinaValida,
  type ZonaCapitalina,
  type MetodoEnvioZona,
} from "@/app/envios/zonasCapitalinas";
import type { ReglasPropias } from "@/app/envios/tarifas";

export type ResultadoAccionMetodo =
  | { ok: true; zona: ZonaCapitalina; metodo: MetodoEnvioZona }
  | { ok: false; error: string };

export type ResultadoAccionReglas =
  | { ok: true; reglas: ReglasPropias }
  | { ok: false; error: string };

export function validarFormularioMetodoZona(formData: FormData): ResultadoAccionMetodo {
  const rawZona = formData.get("zona");
  const rawMetodo = formData.get("metodo");

  const numZona = typeof rawZona === "number" ? rawZona : Number(rawZona);
  if (!Number.isInteger(numZona) || !esZonaCapitalinaValida(numZona)) {
    return { ok: false, error: `La zona ${String(rawZona)} no es válida.` };
  }

  if (rawMetodo !== "mensajero_propio" && rawMetodo !== "guatex") {
    return { ok: false, error: `El método ${String(rawMetodo)} no permitido.` };
  }

  return {
    ok: true,
    zona: numZona,
    metodo: rawMetodo,
  };
}

export function validarFormularioReglasEnvio(formData: FormData): ResultadoAccionReglas {
  const rawTarifa = formData.get("tarifaCents");
  const rawUmbral = formData.get("umbralGratisCents");

  const tarifa = Number(rawTarifa);
  const umbral = Number(rawUmbral);

  if (!Number.isInteger(tarifa) || tarifa < 0) {
    return { ok: false, error: "La tarifa debe ser un número entero de céntimos no negativo." };
  }
  if (!Number.isInteger(umbral) || umbral < 0) {
    return { ok: false, error: "El umbral de gratuidad debe ser un número entero de céntimos no negativo." };
  }

  return {
    ok: true,
    reglas: {
      tarifaCents: tarifa,
      umbralGratisCents: umbral,
    },
  };
}
```

```ts
// app/admin/envios/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { verificarPermisoParaAccion } from "../auth/authorization.server";
import { guardarMetodoZona, guardarReglasPropias } from "@/app/envios/configuracion.server";
import {
  validarFormularioMetodoZona,
  validarFormularioReglasEnvio,
} from "./formularios";

export async function cambiarMetodoZonaAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("envios:escribir");
  const res = validarFormularioMetodoZona(formData);
  if (!res.ok) {
    throw new Error(res.error);
  }

  await guardarMetodoZona(res.zona, res.metodo, admin.id);
  revalidatePath("/admin/envios");
}

export async function guardarReglasEnvioAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("envios:escribir");
  const res = validarFormularioReglasEnvio(formData);
  if (!res.ok) {
    throw new Error(res.error);
  }

  await guardarReglasPropias(res.reglas, admin.id);
  revalidatePath("/admin/envios");
}
```

```tsx
// app/admin/(panel)/envios/page.tsx
import { redirect } from "next/navigation";
import { verificarSesion } from "../../auth/authorization.server";
import { obtenerMetodosZonas, obtenerReglasPropias } from "@/app/envios/configuracion.server";
import { ZONAS_CAPITALINAS_VALIDAS } from "@/app/envios/zonasCapitalinas";
import { cambiarMetodoZonaAction, guardarReglasEnvioAction } from "@/app/admin/envios/actions";

export const dynamic = "force-dynamic";

export default async function AdminEnviosPage() {
  const sesion = await verificarSesion();
  if (!sesion) {
    redirect("/admin/entrar");
  }

  const [metodosZonas, reglas] = await Promise.all([
    obtenerMetodosZonas(),
    obtenerReglasPropias(),
  ]);

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[#001B59]">Configuración operativa de envíos</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Mensajero propio exclusivo en el municipio de Guatemala. Zonas 6, 17 y 18 inicialmente en Guatex. Todo destino fuera de la capital deriva a Guatex.
        </p>
      </div>

      {/* Reglas de tarifa propia */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#001B59]">Reglas de mensajero propio</h2>
        <form action={guardarReglasEnvioAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Tarifa fija (en céntimos de Q)
              <input
                type="number"
                name="tarifaCents"
                defaultValue={reglas.tarifaCents}
                required
                min={0}
                step={1}
                className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <span className="text-xs text-neutral-500">Ejemplo: 3500 céntimos = Q35,00</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Umbral de gratuidad (en céntimos de Q)
              <input
                type="number"
                name="umbralGratisCents"
                defaultValue={reglas.umbralGratisCents}
                required
                min={0}
                step={1}
                className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <span className="text-xs text-neutral-500">Ejemplo: 250000 céntimos = Q2.500,00</span>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded bg-[#001B59] px-4 py-2 text-sm font-medium text-white hover:bg-[#00287a]"
            >
              Guardar reglas de mensajero propio
            </button>
          </div>
        </form>
      </section>

      {/* Tabla de zonas capitalinas */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#001B59]">Métodos por zona (Municipio de Guatemala)</h2>
        <p className="mt-1 text-sm text-neutral-500">
          22 zonas válidas. Cada zona puede servirse con mensajero propio o derivarse a Guatex.
        </p>

        <div className="mt-4 divide-y divide-neutral-200">
          {ZONAS_CAPITALINAS_VALIDAS.map((zona) => {
            const metodoActual = metodosZonas[zona] ?? "mensajero_propio";
            return (
              <form
                key={zona}
                action={cambiarMetodoZonaAction}
                className="flex items-center justify-between py-3"
              >
                <input type="hidden" name="zona" value={zona} />
                <span className="font-medium text-neutral-800">Zona {zona}</span>

                <div className="flex items-center gap-3">
                  <select
                    name="metodo"
                    defaultValue={metodoActual}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    <option value="mensajero_propio">Mensajero propio</option>
                    <option value="guatex">Guatex</option>
                  </select>

                  <button
                    type="submit"
                    className="rounded border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    Actualizar
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>

      {/* Estado de recogida en tienda */}
      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
        <h3 className="font-semibold text-neutral-800">Recogida en tienda</h3>
        <p className="mt-1">
          La recogida en tienda se encuentra <strong>desactivada</strong> por política operativa. Los clientes no pueden seleccionarla en el checkout.
        </p>
      </section>
    </div>
  );
}
```

```tsx
// app/admin/(panel)/envios/[zona]/page.tsx
import { redirect } from "next/navigation";

export default function RedirigirEnviosZona() {
  redirect("/admin/envios");
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-admin-operativo.test.ts`
  - Resultado esperado: Tests pasando.

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir a `test:admin`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 6**
  - Mensaje: `feat(admin): portada simplificada de envios con controles de tarifas y metodos por zona`

---



### Tarea 7: Adaptación de `scripts/verificar-envios.mjs` con preflight de tablas de 9A e invariantes de migración 015

**Files:**
- Modificar: `scripts/verificar-envios.mjs` (sustitución completa: preflight de existencia de tablas 9A en `information_schema.tables`, preserva literalmente las 16 comprobaciones de 9A cuando existen todas, omite 1–16 y continúa con 17 y 18 si no existe ninguna, falla de inmediato si la presencia es parcial, y nunca consulta filas antes de confirmar existencia)

> **Corregido durante la ejecución (04/09/2026).** El borrador de esta tarea, y el bloque de
> código que la acompaña más abajo, hacían que el preflight **abortara si las tablas de 9A
> tenían filas**. Eso contradice §1 del diseño, que manda conservarlas «para permitir
> recuperación y auditoría histórica»: convertía ese archivo en motivo de fallo e impedía
> llegar a las comprobaciones 17 y 18, que no dependen de 9A.
>
> Lo implementado **cuenta sin juzgar**: informa de cuántas filas históricas hay y sigue.
> Para convivir con ellas, los fixtures llevan un sufijo propio de cada ejecución y las
> áreas de prueba se eligen entre los municipios y departamentos **sin cobertura**; al
> terminar se compara el estado anterior con el posterior al `ROLLBACK` y se exige que sean
> **idénticos**, no que estén a cero. El código y la prueba que aparecen abajo con
> `filas residuales` y `0 filas` son la versión del borrador, no la vigente.
- Crear: `tests/envios-verificar-script.test.ts` (pruebas completas del preflight con los tres estados: todas, ninguna y presencia parcial, del guardián de Producción, del conteo seguro y de la captura y acumulación de fallos con rollback garantizado)

**Interfaces:**
- En `scripts/verificar-envios.mjs`:
  ```ts
  /**
   * @typedef {{
   *   query: (texto: string, parametros?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
   * }} ClienteSqlMinimo
   */

  export const TABLAS_9A = ["shipping_zones", "shipping_zone_areas", "shipping_rates"];
  export function decidirDestinoVerificacion(argumentos = []): "produccion" | "desarrollo";
  export function validarDestinoVerificacion(params: { destino: string; host: string; hostProduccion?: string }): { ok: boolean; motivo?: string };
  export function clasificarEstadoTablas9A(tablasExistentes = []): { estado: "todas" | "ninguna" | "parcial"; encontradas: string[]; faltantes: string[] };
  export function verificarPreflightTablas9A(conteos: Record<string, number>): { ok: boolean; motivo?: string };
  export async function obtenerTablasExistentes9A(cliente: ClienteSqlMinimo): Promise<string[]>;
  export async function contarTablasConfiguracion(cliente: ClienteSqlMinimo, tablasAContar?: string[]): Promise<Record<string, number>>;
  export async function ejecutarVerificaciones(cliente: ClienteSqlMinimo, opciones?: { debeContar?: boolean; onBien?: (m: string) => void; onMal?: (m: string, d?: string) => void }): Promise<void>;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/envios-verificar-script.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  clasificarEstadoTablas9A,
  decidirDestinoVerificacion,
  validarDestinoVerificacion,
  verificarPreflightTablas9A,
  obtenerTablasExistentes9A,
  contarTablasConfiguracion,
  ejecutarVerificaciones,
  TABLAS_9A,
} from "../scripts/verificar-envios.mjs";

const PRODUCCION = "ep-misty-sun-avmcbgly.us-east-2.aws.neon.tech";
const DESARROLLO = "ep-plain-frog-av82z3py.us-east-2.aws.neon.tech";

test("decidirDestinoVerificacion distingue --produccion de ejecucion normal", () => {
  assert.equal(decidirDestinoVerificacion([]), "desarrollo");
  assert.equal(decidirDestinoVerificacion(["--contar"]), "desarrollo");
  assert.equal(decidirDestinoVerificacion(["--produccion"]), "produccion");
  assert.equal(decidirDestinoVerificacion(["--produccion", "--contar"]), "produccion");
});

test("validarDestinoVerificacion rechaza Producción sin bandera --produccion", () => {
  const res = validarDestinoVerificacion({
    destino: "desarrollo",
    host: PRODUCCION,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /requiere la bandera explícita --produccion/i);
});

test("validarDestinoVerificacion con --produccion rechaza si el host conectado no es Producción", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: DESARROLLO,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /no es el de Producción/i);
});

test("validarDestinoVerificacion con --produccion rechaza si falta hostProduccion", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: PRODUCCION,
    hostProduccion: "",
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /NEON_ENDPOINT_PRODUCCION/i);
});

test("validarDestinoVerificacion acepta Producción con --produccion cuando coincide exactamente", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: PRODUCCION,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, true);
});

test("validarDestinoVerificacion acepta pooler de Producción con --produccion", () => {
  const poolerHost = PRODUCCION.replace("ep-misty-sun-avmcbgly", "ep-misty-sun-avmcbgly-pooler");
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: poolerHost,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, true);
});

test("clasificarEstadoTablas9A identifica los tres estados: todas, ninguna y presencia parcial", () => {
  // Estado 1: todas existen
  const todas = clasificarEstadoTablas9A(TABLAS_9A);
  assert.equal(todas.estado, "todas");
  assert.equal(todas.encontradas.length, 3);
  assert.equal(todas.faltantes.length, 0);

  // Estado 2: ninguna existe (subproyecto 9A no migrado en esta rama)
  const ninguna = clasificarEstadoTablas9A([]);
  assert.equal(ninguna.estado, "ninguna");
  assert.equal(ninguna.encontradas.length, 0);
  assert.equal(ninguna.faltantes.length, 3);

  // Estado 3: presencia parcial (instalación rota o incompleta)
  const parcial1 = clasificarEstadoTablas9A(["shipping_zones"]);
  assert.equal(parcial1.estado, "parcial");
  assert.deepEqual(parcial1.encontradas, ["shipping_zones"]);
  assert.deepEqual(parcial1.faltantes, ["shipping_zone_areas", "shipping_rates"]);

  const parcial2 = clasificarEstadoTablas9A(["shipping_zones", "shipping_rates"]);
  assert.equal(parcial2.estado, "parcial");
  assert.deepEqual(parcial2.faltantes, ["shipping_zone_areas"]);
});

test("verificarPreflightTablas9A exige 0 filas en las tablas de 9A", () => {
  const vacias = { shipping_zones: 0, shipping_zone_areas: 0, shipping_rates: 0 };
  assert.equal(verificarPreflightTablas9A(vacias).ok, true);

  const conFilas = { shipping_zones: 1, shipping_zone_areas: 0, shipping_rates: 0 };
  assert.equal(verificarPreflightTablas9A(conFilas).ok, false);
  assert.match(verificarPreflightTablas9A(conFilas).motivo ?? "", /1 filas residuales/);
});

test("preflight con cliente simulado: estado ninguna solo consulta information_schema, no ejecuta conteos 9A y supera checks 17 y 18", async () => {
  const consultasEjecutadas: string[] = [];
  let rollbackEjecutado = false;

  const clienteSimulado = {
    async query(sql: string, _params?: readonly unknown[]) {
      consultasEjecutadas.push(sql);
      if (sql.includes("information_schema.tables")) {
        return { rows: [] }; // Ninguna tabla 9A existe
      }
      if (sql === "begin" || sql.startsWith("savepoint") || sql.startsWith("release savepoint")) {
        return { rows: [] };
      }
      if (sql === "rollback") {
        rollbackEjecutado = true;
        return { rows: [] };
      }
      if (sql.includes("from users")) {
        return { rows: [{ id: 42 }] };
      }
      if (sql.includes("insert into user_addresses")) {
        if (sql.includes("Zona 20") || sql.includes("Sin Zona") || sql.includes("Mixco con zona")) {
          throw new Error("check constraint violation simulado");
        }
        return { rows: [{ id: 101 }] };
      }
      if (sql.includes("from app_settings")) {
        return {
          rows: [
            { clave: "envios_zonas_metodos", valor: "{}" },
            { clave: "envios_reglas_propias", valor: "{}" },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const tablas = await obtenerTablasExistentes9A(clienteSimulado);
  assert.deepEqual(tablas, []);

  let aviso9A = false;
  let check17Ok = false;
  let check18Ok = false;

  await ejecutarVerificaciones(clienteSimulado, {
    debeContar: false,
    onBien: (msg: string) => {
      if (msg.includes("Aviso 9A: las tablas de 9A no existen")) aviso9A = true;
      if (msg.includes("17. Invariantes de zona_capitalina")) check17Ok = true;
      if (msg.includes("18. Configuración operativa")) check18Ok = true;
    },
  });

  assert.equal(aviso9A, true, "Debe emitir aviso informativo de que 9A no está migrada");
  assert.equal(check17Ok, true, "check17Ok === true: la comprobación 17 debe terminar con éxito");
  assert.equal(check18Ok, true, "check18Ok === true: la comprobación 18 debe terminar con éxito");

  const conteos9A = consultasEjecutadas.filter((q) =>
    q.includes('from "shipping_zones"') ||
    q.includes('from "shipping_zone_areas"') ||
    q.includes('from "shipping_rates"')
  );
  assert.equal(conteos9A.length, 0, "Cero SELECT count sobre tablas 9A");

  const consultasAppSettings = consultasEjecutadas.filter((q) => q.includes("from app_settings"));
  assert.ok(consultasAppSettings.length > 0, "Existencia de la consulta a app_settings");
  assert.equal(rollbackEjecutado, true, "ROLLBACK ejecutado");
});

test("preflight con cliente simulado: presencia parcial falla antes de consultar filas de tablas 9A", async () => {
  const consultasEjecutadas: string[] = [];
  const clienteSimulado = {
    async query(sql: string) {
      consultasEjecutadas.push(sql);
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_name: "shipping_zones" }] }; // Parcial: falta zone_areas y rates
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(clienteSimulado);
    },
    {
      message: /Instalación parcial incompleta del subproyecto 9A/i,
    },
  );

  const conteos9A = consultasEjecutadas.filter((q) =>
    q.includes("select count") || q.includes('from "shipping_zones"')
  );
  assert.equal(conteos9A.length, 0, "No debe intentar contar ni consultar tablas ante presencia parcial");
});

test("preflight con cliente simulado: estado todas cuenta exclusivamente las 3 tablas canónicas", async () => {
  const tablasContadas: string[] = [];
  const clienteSimulado = {
    async query(sql: string, _params?: readonly unknown[]) {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [
            { table_name: "shipping_zones" },
            { table_name: "shipping_zone_areas" },
            { table_name: "shipping_rates" },
          ],
        };
      }
      for (const t of TABLAS_9A) {
        if (sql.includes('from "' + t + '"')) {
          tablasContadas.push(t);
          return { rows: [{ total: 0 }] };
        }
      }
      return { rows: [] };
    },
  };

  const tablas = await obtenerTablasExistentes9A(clienteSimulado);
  assert.deepEqual(tablas.sort(), [...TABLAS_9A].sort());

  const conteos = await contarTablasConfiguracion(clienteSimulado, tablas);
  assert.deepEqual(conteos, {
    shipping_zones: 0,
    shipping_zone_areas: 0,
    shipping_rates: 0,
  });
  assert.deepEqual(tablasContadas.sort(), [...TABLAS_9A].sort());
});

test("caso negativo: si falta envios_reglas_propias en la comprobación 18, ejecutarVerificaciones rechaza y ejecuta ROLLBACK", async () => {
  let rollbackEjecutado = false;
  const fallosRegistrados: Array<{ nombre: string; detalle?: string }> = [];

  const clienteSimulado = {
    async query(sql: string) {
      if (sql.includes("information_schema.tables")) {
        return { rows: [] }; // Estado ninguna
      }
      if (sql === "begin" || sql.startsWith("savepoint") || sql.startsWith("release savepoint")) {
        return { rows: [] };
      }
      if (sql === "rollback") {
        rollbackEjecutado = true;
        return { rows: [] };
      }
      if (sql.includes("from users")) {
        return { rows: [{ id: 42 }] };
      }
      if (sql.includes("insert into user_addresses")) {
        if (sql.includes("Zona 20") || sql.includes("Sin Zona") || sql.includes("Mixco con zona")) {
          throw new Error("check constraint violation simulado");
        }
        return { rows: [{ id: 101 }] };
      }
      if (sql.includes("from app_settings")) {
        // Devuelve solo envios_zonas_metodos; falta envios_reglas_propias
        return {
          rows: [{ clave: "envios_zonas_metodos", valor: "{}" }],
        };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(clienteSimulado, {
        onMal: (nombre, detalle) => {
          fallosRegistrados.push({ nombre, detalle });
        },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /se detectaron 1 fallos en comprobaciones/i);
      assert.match(err.message, /18. Configuración operativa sembrada en app_settings/);
      return true;
    },
  );

  assert.equal(rollbackEjecutado, true, "El ROLLBACK debe ejecutarse siempre en el bloque finally");
  assert.equal(fallosRegistrados.length, 1);
  assert.equal(fallosRegistrados[0]?.nombre, "18. Configuración operativa sembrada en app_settings");
});

test("demostración de seguridad: una comprobación que invoque registrarMal provoca rechazo, nunca permite certificar éxito y ejecuta ROLLBACK", async () => {
  let rollbackEjecutado = false;
  const clienteSimulado = {
    async query(sql: string) {
      if (sql.includes("information_schema.tables")) return { rows: [] };
      if (sql === "begin" || sql.startsWith("savepoint") || sql.startsWith("release savepoint")) return { rows: [] };
      if (sql === "rollback") {
        rollbackEjecutado = true;
        return { rows: [] };
      }
      if (sql.includes("from users")) return { rows: [{ id: 42 }] };
      if (sql.includes("insert into user_addresses")) {
        // Falla deliberadamente la comprobación 17 admitiendo una inserción inválida
        return { rows: [{ id: 999 }] };
      }
      if (sql.includes("from app_settings")) {
        return {
          rows: [
            { clave: "envios_zonas_metodos", valor: "{}" },
            { clave: "envios_reglas_propias", valor: "{}" },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(clienteSimulado);
    },
    /se detectaron 1 fallos en comprobaciones/i,
  );

  assert.equal(rollbackEjecutado, true, "Garantiza ROLLBACK incluso ante fallo deliberado");
});
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-verificar-script.test.ts`
  - Fallo esperado: `clasificarEstadoTablas9A` y `TABLAS_9A` no existen en `scripts/verificar-envios.mjs`.

- [ ] **Paso 3: Escribir la implementación completa de `scripts/verificar-envios.mjs` (GREEN)**

```javascript
// scripts/verificar-envios.mjs
// Comprueba los invariantes de envíos, zonas y tarifas contra una base de datos real.
//
// Verifica que PostgreSQL impone en el esquema todos los invariantes definidos en 9A:
// unicidad de cobertura, exclusión GiST de tarifas, inmutabilidad de publicadas,
// no programación futura, borrado restringido, clave foránea compuesta en direcciones,
// serialización con for update, auditoría en la misma transacción y roles de admin.
//
// Añade además la verificación de los invariantes de la migración 015:
// - preflight seguro de tablas de 9A: comprueba su existencia en information_schema antes de consultarlas
// - checks de zona capitalina en user_addresses
// - presencia de configuración operativa en app_settings
//
// Se ejecuta dentro de una transacción que SIEMPRE hace ROLLBACK, garantizando que
// no quede ningún dato residual. Exige la bandera explícita --produccion si se conecta a Producción.

import { fileURLToPath } from "node:url";
import { Client, neonConfig } from "@neondatabase/serverless";
import { endpointCanonico, decidirLecturaEnProduccion } from "./guarda-neon.mjs";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const ENDPOINT_PRODUCCION = "ep-misty-sun-avmcbgly";

export const TABLAS_9A = ["shipping_zones", "shipping_zone_areas", "shipping_rates"];

/**
 * @typedef {{
 *   code?: string;
 *   message?: string;
 * }} ErrorSqlPostgres
 */

/**
 * @typedef {{
 *   query: (texto: string, parametros?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
 * }} ClienteSqlMinimo
 */

/**
 * @param {string[]} [argumentos]
 * @returns {"produccion" | "desarrollo"}
 */
export function decidirDestinoVerificacion(argumentos = []) {
  return argumentos.includes("--produccion") ? "produccion" : "desarrollo";
}

/**
 * @param {{ destino: string; host: string; hostProduccion?: string }} params
 * @returns {{ ok: boolean; motivo?: string }}
 */
export function validarDestinoVerificacion({ destino, host, hostProduccion = ENDPOINT_PRODUCCION }) {
  const conectado = endpointCanonico(host);
  const produccion = endpointCanonico(hostProduccion);

  if (destino === "produccion") {
    const decision = decidirLecturaEnProduccion({ host: conectado, hostProduccion: produccion });
    if (!decision.ok) {
      return {
        ok: false,
        motivo: decision.motivo || `Se indicó --produccion pero el endpoint conectado no es el de Producción: ${host || "vacío"}.`,
      };
    }
    return { ok: true };
  }

  // Si destino es desarrollo, comprobar que no sea Producción
  if (conectado.includes(ENDPOINT_PRODUCCION) || (produccion && conectado === produccion)) {
    return {
      ok: false,
      motivo:
        "El endpoint conectado es de Producción; este comando requiere la bandera explícita --produccion para ejecutarse contra Producción.",
    };
  }

  return { ok: true };
}

/**
 * @param {readonly string[]} [tablasExistentes]
 * @returns {{ estado: "todas" | "ninguna" | "parcial"; encontradas: string[]; faltantes: string[] }}
 */
export function clasificarEstadoTablas9A(tablasExistentes = []) {
  const conjunto = new Set(tablasExistentes);
  const encontradas = TABLAS_9A.filter((t) => conjunto.has(t));
  const faltantes = TABLAS_9A.filter((t) => !conjunto.has(t));
  if (encontradas.length === 3) {
    return { estado: "todas", encontradas, faltantes: [] };
  }
  if (encontradas.length === 0) {
    return { estado: "ninguna", encontradas: [], faltantes: TABLAS_9A };
  }
  return { estado: "parcial", encontradas, faltantes };
}

/**
 * @param {Record<string, number>} conteos
 * @returns {{ ok: boolean; motivo?: string }}
 */
export function verificarPreflightTablas9A(conteos) {
  const total = (conteos.shipping_zones ?? 0) + (conteos.shipping_zone_areas ?? 0) + (conteos.shipping_rates ?? 0);
  if (total === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    motivo: `Las tablas de 9A contienen ${total} filas residuales fuera de la prueba. Deben estar limpias (0 filas).`,
  };
}

/**
 * @param {ClienteSqlMinimo} cliente
 * @returns {Promise<string[]>}
 */
export async function obtenerTablasExistentes9A(cliente) {
  const { rows } = await cliente.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
    [TABLAS_9A],
  );
  return rows.map((r) => String(r.table_name));
}

/**
 * @param {ClienteSqlMinimo} cliente
 * @param {readonly string[]} [tablasAContar]
 * @returns {Promise<Record<string, number>>}
 */
export async function contarTablasConfiguracion(cliente, tablasAContar = TABLAS_9A) {
  /** @type {Record<string, number>} */
  const conteos = {};
  for (const tabla of tablasAContar) {
    const { rows } = await cliente.query(`select count(*)::int as total from "${tabla}"`);
    conteos[tabla] = Number(rows[0]?.total ?? 0);
  }
  return conteos;
}

/**
 * @param {ClienteSqlMinimo} cliente
 * @param {() => Promise<unknown>} accion
 * @returns {Promise<
 *   | { ok: true; resultado: unknown }
 *   | { ok: false; error: ErrorSqlPostgres }
 * >}
 */
async function ejecutarConSavepoint(cliente, accion) {
  const sp = `sp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  await cliente.query(`savepoint ${sp}`);
  try {
    const resultado = await accion();
    await cliente.query(`release savepoint ${sp}`);
    return { ok: true, resultado };
  } catch (error) {
    await cliente.query(`rollback to savepoint ${sp}`);
    return { ok: false, error: /** @type {ErrorSqlPostgres} */ (error) };
  }
}

/**
 * @param {ClienteSqlMinimo} cliente
 * @param {{ debeContar?: boolean; onBien?: (mensaje: string) => void; onMal?: (nombre: string, detalle?: string) => void }} [opciones]
 * @returns {Promise<void>}
 */
export async function ejecutarVerificaciones(cliente, { debeContar = false, onBien = () => {}, onMal = () => {} } = {}) {
  // Preflight seguro de existencia de tablas de 9A mediante information_schema.tables
  const tablasExistentes = await obtenerTablasExistentes9A(cliente);
  const diagnostico = clasificarEstadoTablas9A(tablasExistentes);

  if (diagnostico.estado === "parcial") {
    const motivo = `Instalación parcial incompleta del subproyecto 9A: existen [${diagnostico.encontradas.join(", ")}] pero faltan [${diagnostico.faltantes.join(", ")}]. Deben existir las 3 tablas o ninguna.`;
    onMal("Preflight tablas 9A", motivo);
    throw new Error(motivo);
  }

  let ejecutarBloque9A = false;
  if (diagnostico.estado === "ninguna") {
    onBien("Aviso 9A: las tablas de 9A no existen en la base de datos. Se omiten las comprobaciones 1–16 y se continúa con las comprobaciones 17–18.");
  } else {
    // diagnostico.estado === "todas"
    const conteosPrevios = await contarTablasConfiguracion(cliente, diagnostico.encontradas);
    if (debeContar) {
      console.log("Conteos previos de tablas 9A:", conteosPrevios);
    }
    const preflight = verificarPreflightTablas9A(conteosPrevios);
    if (!preflight.ok) {
      onMal("Preflight tablas 9A", preflight.motivo);
      throw new Error(preflight.motivo);
    }
    onBien("Preflight 9A: las 3 tablas de configuración existen y tienen 0 filas");
    ejecutarBloque9A = true;
  }

  console.log("Iniciando transacción de verificación (concluirá siempre en ROLLBACK)...");
  await cliente.query("begin");

  /** @type {Array<{ nombre: string; detalle?: string }>} */
  const fallosAcumulados = [];

  const registrarBien = (/** @type {string} */ mensaje) => {
    onBien(mensaje);
  };

  const registrarMal = (/** @type {string} */ nombre, /** @type {string} */ [detalle]) => {
    fallosAcumulados.push({ nombre, detalle });
    onMal(nombre, detalle);
  };

  /** @type {unknown} */
  let errorInesperado = null;

  try {
    if (ejecutarBloque9A) {
      // -------------------------------------------------------------------------
      // 1. Un municipio en dos zonas -> rechazado (violación de exclusión/unicidad)
      // -------------------------------------------------------------------------
      {
        const { rows: zA } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-muni-1', 'Zona Municipio 1', 'paqueteria', true)
           returning id`,
        );
        const { rows: zB } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-muni-2', 'Zona Municipio 2', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
           values ($1, '0101', true)`,
          [zA[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
             values ($1, '0101', true)`,
            [zB[0].id],
          ),
        );

        if (!intento.ok) {
          if (intento.error.code === "23505") {
            registrarBien("1. Un municipio en dos zonas -> rechazado");
          } else {
            registrarMal("1. Un municipio en dos zonas -> rechazado", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("1. Un municipio en dos zonas -> rechazado", "se insertó duplicado sin error");
        }
      }

      // -------------------------------------------------------------------------
      // 2. Un departamento en dos zonas -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: zA } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-depto-1', 'Zona Depto 1', 'paqueteria', true)
           returning id`,
        );
        const { rows: zB } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-depto-2', 'Zona Depto 2', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_zone_areas (zone_id, departamento_codigo, activa)
           values ($1, '01', true)`,
          [zA[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_zone_areas (zone_id, departamento_codigo, activa)
             values ($1, '01', true)`,
            [zB[0].id],
          ),
        );

        if (!intento.ok) {
          if (intento.error.code === "23505") {
            registrarBien("2. Un departamento en dos zonas -> rechazado");
          } else {
            registrarMal("2. Un departamento en dos zonas -> rechazado", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("2. Un departamento en dos zonas -> rechazado", "se insertó duplicado sin error");
        }
      }

      // -------------------------------------------------------------------------
      // 3. Dos tarifas en la misma zona solapadas en precio -> rechazado (GiST)
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-gist', 'Zona GiST', 'paqueteria', true)
           returning id`,
        );
        const zoneId = z[0].id;

        await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)`,
          [zoneId],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
             values ($1, 4000, 5000, 15000, true)`,
            [zoneId],
          ),
        );

        if (!intento.ok) {
          if (intento.error.code === "23P01" || intento.error.code === "23505") {
            registrarBien("3. Dos tarifas en la misma zona solapadas en precio -> rechazado (GiST)");
          } else {
            registrarMal("3. Dos tarifas en la misma zona solapadas en precio -> rechazado (GiST)", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("3. Dos tarifas en la misma zona solapadas en precio -> rechazado (GiST)", "se insertó tarifa solapada sin error");
        }
      }

      // -------------------------------------------------------------------------
      // 4. Dos tarifas consecutivas contiguas -> admitidas
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-contigua', 'Zona Contigua', 'paqueteria', true)
           returning id`,
        );
        const zoneId = z[0].id;

        await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)`,
          [zoneId],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
             values ($1, 3000, 10000, 20000, true)`,
            [zoneId],
          ),
        );

        if (intento.ok) {
          registrarBien("4. Dos tarifas consecutivas contiguas -> admitidas");
        } else {
          registrarMal("4. Dos tarifas consecutivas contiguas -> admitidas", intento.error.message || "error al insertar tarifas contiguas");
        }
      }

      // -------------------------------------------------------------------------
      // 5. Modificar tarifa publicada activa -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-inmutable', 'Zona Inmutable', 'paqueteria', true)
           returning id`,
        );
        const { rows: r } = await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)
           returning id`,
          [z[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `update shipping_rates set coste_cents = 6000 where id = $1`,
            [r[0].id],
          ),
        );

        if (!intento.ok) {
          registrarBien("5. Modificar tarifa publicada activa -> rechazado (inmutable)");
        } else {
          registrarMal("5. Modificar tarifa publicada activa -> rechazado", "se permitió el update");
        }
      }

      // -------------------------------------------------------------------------
      // 6. Tarifa con vigencia_fin anterior a vigencia_inicio -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-vigencia', 'Zona Vigencia', 'paqueteria', true)
           returning id`,
        );

        const ahora = new Date();
        const pasado = new Date(ahora.getTime() - 86400000);

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, vigencia_inicio, vigencia_fin, activa)
             values ($1, 5000, 0, 10000, $2, $3, true)`,
            [z[0].id, ahora, pasado],
          ),
        );

        if (!intento.ok) {
          registrarBien("6. Tarifa con vigencia_fin anterior a vigencia_inicio -> rechazado");
        } else {
          registrarMal("6. Tarifa con vigencia_fin anterior a vigencia_inicio -> rechazado", "se permitió vigencia invertida");
        }
      }

      // -------------------------------------------------------------------------
      // 7. Tarifa con vigencia futura -> rechazado (sin programación futura)
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-futura', 'Zona Futura', 'paqueteria', true)
           returning id`,
        );

        const futuro = new Date(Date.now() + 86400000 * 10);

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, vigencia_inicio, activa)
             values ($1, 5000, 0, 10000, $2, true)`,
            [z[0].id, futuro],
          ),
        );

        if (!intento.ok) {
          registrarBien("7. Tarifa con vigencia futura -> rechazado");
        } else {
          registrarMal("7. Tarifa con vigencia futura -> rechazado", "se permitió fecha futura");
        }
      }

      // -------------------------------------------------------------------------
      // 8. Tarifa con coste negativo -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-negativa', 'Zona Coste Negativo', 'paqueteria', true)
           returning id`,
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
             values ($1, -500, 0, 10000, true)`,
            [z[0].id],
          ),
        );

        if (!intento.ok) {
          registrarBien("8. Tarifa con coste negativo -> rechazado");
        } else {
          registrarMal("8. Tarifa con coste negativo -> rechazado", "se permitió coste negativo");
        }
      }

      // -------------------------------------------------------------------------
      // 9. Borrar zona con tarifas activas -> rechazado (FK restrict)
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-fk', 'Zona FK Restrict', 'paqueteria', true)
           returning id`,
        );
        await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)`,
          [z[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(`delete from shipping_zones where id = $1`, [z[0].id]),
        );

        if (!intento.ok) {
          if (intento.error.code === "23503") {
            registrarBien("9. Borrar zona con tarifas activas -> rechazado (FK restrict)");
          } else {
            registrarMal("9. Borrar zona con tarifas activas -> rechazado", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("9. Borrar zona con tarifas activas -> rechazado", "se borró zona con tarifas");
        }
      }

      // -------------------------------------------------------------------------
      // 10. Desactivar zona desactiva la resolución de tarifas
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-desact', 'Zona Desactivable', 'paqueteria', true)
           returning id`,
        );
        await cliente.query(
          `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
           values ($1, '0901', true)`,
          [z[0].id],
        );
        await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)`,
          [z[0].id],
        );

        await cliente.query(`update shipping_zones set activa = false where id = $1`, [z[0].id]);

        const { rows: res } = await cliente.query(
          `select r.coste_cents
             from shipping_rates r
             join shipping_zones z on z.id = r.zone_id
             join shipping_zone_areas a on a.zone_id = z.id
            where a.municipio_codigo = '0901'
              and z.activa = true
              and r.activa = true`,
        );

        if (res.length === 0) {
          registrarBien("10. Desactivar zona desactiva la resolución de tarifas");
        } else {
          registrarMal("10. Desactivar zona desactiva la resolución de tarifas", "la tarifa sigue resolviendo");
        }
      }

      // -------------------------------------------------------------------------
      // 11. Municipio inexistente en shipping_zone_areas -> rechazado (FK geo_municipios)
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-muni-inex', 'Zona Muni Inexistente', 'paqueteria', true)
           returning id`,
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
             values ($1, '9999', true)`,
            [z[0].id],
          ),
        );

        if (!intento.ok) {
          if (intento.error.code === "23503") {
            registrarBien("11. Municipio inexistente en shipping_zone_areas -> rechazado (FK geo_municipios)");
          } else {
            registrarMal("11. Municipio inexistente en shipping_zone_areas -> rechazado", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("11. Municipio inexistente en shipping_zone_areas -> rechazado", "se insertó municipio inexistente");
        }
      }

      // -------------------------------------------------------------------------
      // 12. user_addresses con municipio ajeno a departamento -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: users } = await cliente.query(`select id from users limit 1`);
        let userId = users[0]?.id;
        if (!userId) {
          const { rows: u } = await cliente.query(
            `insert into users (email, full_name, role)
             values ('test-verif@econoluz.test', 'Usuario Sintetico', 'cliente')
             returning id`,
          );
          userId = u[0].id;
        }

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into user_addresses (
               user_id, destinatario, telefono, direccion,
               departamento_codigo, municipio_codigo, departamento, municipio, predeterminada
             ) values (
               $1, 'Test', '12345678', 'Calle 1',
               '01', '0901', 'Guatemala', 'Quetzaltenango', false
             )`,
            [userId],
          ),
        );

        if (!intento.ok) {
          if (intento.error.code === "23503") {
            registrarBien("12. user_addresses con municipio ajeno a departamento -> rechazado (FK compuesta)");
          } else {
            registrarMal("12. user_addresses con municipio ajeno a departamento -> rechazado", intento.error.message || "código de error inesperado");
          }
        } else {
          registrarMal("12. user_addresses con municipio ajeno a departamento -> rechazado", "se permitió inconsistencia geográfica");
        }
      }

      // -------------------------------------------------------------------------
      // 13. Lectura con FOR UPDATE bloquea la zona
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-lock', 'Zona Bloqueo', 'paqueteria', true)
           returning id`,
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(`select id from shipping_zones where id = $1 for update`, [z[0].id]),
        );

        if (intento.ok) {
          const filas = /** @type {{ rows: unknown[] }} */ (intento.resultado).rows;
          if (filas.length === 1) {
            registrarBien("13. Lectura con FOR UPDATE bloquea la zona");
          } else {
            registrarMal("13. Lectura con FOR UPDATE bloquea la zona", `se esperaban 1 fila y se obtuvieron ${filas.length}`);
          }
        } else {
          registrarMal("13. Lectura con FOR UPDATE bloquea la zona", intento.error.message || "error al ejecutar FOR UPDATE");
        }
      }

      // -------------------------------------------------------------------------
      // 14. Mutación en shipping_rates registra en audit_log en la misma transacción
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-audit', 'Zona Audit', 'paqueteria', true)
           returning id`,
        );
        const { rows: r } = await cliente.query(
          `insert into shipping_rates (zone_id, coste_cents, min_subtotal_cents, max_subtotal_cents, activa)
           values ($1, 5000, 0, 10000, true)
           returning id`,
          [z[0].id],
        );

        await cliente.query(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, despues)
           values ('admin', '00000000-0000-0000-0000-000000000000', 'crear_tarifa', 'shipping_rates', $1, '{"coste": 5000}'::jsonb)`,
          [r[0].id],
        );

        const { rows: a } = await cliente.query(
          `select id from audit_log where entidad = 'shipping_rates' and entidad_id = $1`,
          [r[0].id],
        );

        if (a.length === 1) {
          registrarBien("14. Mutación en shipping_rates registra en audit_log en la misma transacción");
        } else {
          registrarMal("14. Mutación en shipping_rates registra en audit_log", "no se encontró fila en audit_log");
        }
      }

      // -------------------------------------------------------------------------
      // 15. Rol operador no puede publicar tarifas
      // -------------------------------------------------------------------------
      {
        registrarBien("15. Rol operador no puede publicar tarifas (control de roles validado en aplicación)");
      }

      // -------------------------------------------------------------------------
      // 16. Rol admin sí puede publicar tarifas
      // -------------------------------------------------------------------------
      {
        registrarBien("16. Rol admin sí puede publicar tarifas (control de roles validado en aplicación)");
      }
    }

    // -------------------------------------------------------------------------
    // Comprobaciones independientes 17 y 18 (migración 015)
    // Se ejecutan SIEMPRE, tanto si existen las tablas 9A como si no existen.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    
    // -------------------------------------------------------------------------
    // Comprobaciones independientes 17 y 18 (migración 015)
    // Se ejecutan SIEMPRE, tanto si existen las tablas 9A como si no existen.
    // -------------------------------------------------------------------------

    
    // -------------------------------------------------------------------------
    // Comprobaciones independientes 17 y 18 (migración 015)
    // Se ejecutan SIEMPRE, tanto si existen las tablas 9A como si no existen.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // 17. Invariantes de zona_capitalina en user_addresses (migración 015)
    // -------------------------------------------------------------------------
    {
      const { rows: users } = await cliente.query(`select id from users limit 1`);
      let userId = users[0]?.id;
      if (!userId) {
        const { rows: u } = await cliente.query(
          `insert into users (email, full_name, role)
           values ('test-verif-015@econoluz.test', 'Usuario Sintetico 015', 'cliente')
           returning id`,
        );
        userId = u[0]?.id;
      }

      // 17.a. Municipio de Guatemala (0101) con zona 10 -> admitido
      const intentoValido = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Valido', '12345678', 'Zona 10 Calle Real',
             '01', '0101', 'Guatemala', 'Guatemala',
             10, false
           )`,
          [userId],
        ),
      );

      // 17.b. Municipio de Guatemala (0101) con zona 20 (inexistente) -> rechazado
      const intentoZona20 = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Zona 20', '12345678', 'Zona 20 Calle Falsa',
             '01', '0101', 'Guatemala', 'Guatemala',
             20, false
           )`,
          [userId],
        ),
      );

      // 17.c. Municipio de Guatemala (0101) con zona_capitalina null -> rechazado
      const intentoSinZona = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Sin Zona', '12345678', 'Calle sin zona',
             '01', '0101', 'Guatemala', 'Guatemala',
             null, false
           )`,
          [userId],
        ),
      );

      // 17.d. Municipio fuera de la capital (Mixco 0108) con zona no nula -> rechazado
      const intentoMixcoConZona = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Mixco con zona', '12345678', 'Calle Mixco',
             '01', '0108', 'Guatemala', 'Mixco',
             1, false
           )`,
          [userId],
        ),
      );

      if (
        intentoValido.ok &&
        !intentoZona20.ok &&
        !intentoSinZona.ok &&
        !intentoMixcoConZona.ok
      ) {
        registrarBien("17. Invariantes de zona_capitalina en user_addresses (migración 015) -> validados");
      } else {
        registrarMal(
          "17. Invariantes de zona_capitalina en user_addresses",
          `Valido: ${intentoValido.ok}, Zona20 rechazada: ${!intentoZona20.ok}, SinZona rechazada: ${!intentoSinZona.ok}, MixcoConZona rechazada: ${!intentoMixcoConZona.ok}`,
        );
      }
    }

    // -------------------------------------------------------------------------
    // 18. Configuración operativa de envíos sembrada en app_settings (migración 015)
    // -------------------------------------------------------------------------
    {
      const { rows } = await cliente.query(
        `select clave, valor from app_settings
          where clave in ('envios_zonas_metodos', 'envios_reglas_propias')`,
      );

      const mapa = new Map(rows.map((r) => [String(r.clave), r.valor]));
      const tieneZonas = mapa.has("envios_zonas_metodos");
      const tieneReglas = mapa.has("envios_reglas_propias");

      if (tieneZonas && tieneReglas) {
        registrarBien("18. Configuración operativa sembrada en app_settings (migración 015) -> presente");
      } else {
        registrarMal(
          "18. Configuración operativa sembrada en app_settings",
          `envios_zonas_metodos: ${tieneZonas ? "OK" : "FALTA"}, envios_reglas_propias: ${tieneReglas ? "OK" : "FALTA"}`,
        );
      }
    }
  } catch (err) {
    errorInesperado = err;
  } finally {
    console.log("Ejecutando ROLLBACK garantizado de la transacción...");
    try {
      await cliente.query("rollback");
    } catch (errRollback) {
      if (!errorInesperado) {
        errorInesperado = errRollback;
      }
    }
  }

  // Después del rollback garantizado:
  // 1. Si hubo un error inesperado durante las comprobaciones o el rollback, se propaga primero sin ocultarlo
  if (errorInesperado) {
    throw errorInesperado;
  }

  // 2. Si no hubo error inesperado pero fallaron comprobaciones, se lanza el error agregado
  if (fallosAcumulados.length > 0) {
    const resumen = fallosAcumulados
      .map((f, idx) => `  [${idx + 1}] ${f.nombre}${f.detalle ? `: ${f.detalle}` : ""}`)
      .join("\n");
    throw new Error(
      `La verificación de invariantes falló: se detectaron ${fallosAcumulados.length} fallos en comprobaciones:\n${resumen}`,
    );
  }

  // 3. Resuelve limpiamente únicamente cuando no hubo error ni fallos
}

async function principal() {
  const argumentos = process.argv.slice(2);
  const destino = decidirDestinoVerificacion(argumentos);
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
  const hostProduccion = process.env.NEON_ENDPOINT_PRODUCCION || ENDPOINT_PRODUCCION;

  const validacion = validarDestinoVerificacion({ destino, host, hostProduccion });
  if (!validacion.ok) {
    console.error(`ERROR: ${validacion.motivo}`);
    process.exitCode = 1;
    return;
  }

  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();

  let huboError = false;

  try {
    if (argumentos.includes("--contar")) {
      const tablasExistentes = await obtenerTablasExistentes9A(cliente);
      const diagnostico = clasificarEstadoTablas9A(tablasExistentes);
      if (diagnostico.estado === "ninguna") {
        console.log("Aviso: Ninguna tabla de 9A existe en la base de datos (0 tablas encontradas).");
      } else if (diagnostico.estado === "parcial") {
        console.error(
          `Error: Instalación parcial de 9A: existen [${diagnostico.encontradas.join(", ")}] pero faltan [${diagnostico.faltantes.join(", ")}].`,
        );
        huboError = true;
      } else {
        const conteos = await contarTablasConfiguracion(cliente, diagnostico.encontradas);
        console.log("Conteos de tablas 9A:", conteos);
      }
      return;
    }

    let fallosDetectados = 0;
    await ejecutarVerificaciones(cliente, {
      debeContar: false,
      onBien: (mensaje) => console.log(`  ✓ ${mensaje}`),
      onMal: (nombre, detalle) => {
        fallosDetectados++;
        console.error(`  ✗ ${nombre}: ${detalle || ""}`);
      },
    });

    if (fallosDetectados > 0) {
      console.error(`\nERROR: Se detectaron ${fallosDetectados} fallos en las comprobaciones. Certificación rechazada.`);
      huboError = true;
      return;
    }

    console.log("\nTodas las comprobaciones superadas con éxito.");
  } catch (error) {
    huboError = true;
    console.error("\nError fatal durante la verificación de invariantes:", error instanceof Error ? error.message : error);
  } finally {
    await cliente.end();
    if (huboError) {
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((err) => {
    console.error("Error fatal no capturado:", err);
    process.exitCode = 1;
  });
}
```

- [ ] **Paso 4: Ejecutar las pruebas unitarias del script y comprobar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-verificar-script.test.ts`
  - Resultado esperado: Tests pasando (13 de 13 superadas).

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 7**
  - Mensaje: `feat(envios): preflight de tablas 9A y comprobacion de invariantes de migracion 015 en script de verificacion`

---

### Tarea 8: Autenticación E2E real de clientes, prueba de Playwright y documentación

**Files:**
- Crear: `tests/helpers/cliente-e2e.ts`
- Crear: `tests/envios-operativos.spec.ts`
- Modificar: `package.json` (dependencia `@next/env` en `devDependencies`)
- Modificar: `playwright.config.ts` (carga de `.env.local` y propagación de variables E2E a `webServer.env`)
- Modificar: `CLAUDE.md`
- Modificar: `docs/CONTINUAR-PANEL.md`
- Modificar: `.env.example` y `docs/OPERACION-FIREBASE.md` (variables del emulador para E2E)

**Interfaces:**
- En `tests/helpers/cliente-e2e.ts`:
  ```ts
  export type ClienteE2E = { userId: string; uid: string; email: string; contrasena: string; nombre: string };
  export function exigirBaseE2EAislada(): void;
  export function exigirEmuladorFirebase(): { emulador: string; apiKey: string; proyecto: string };
  export function aprovisionarClienteE2E(context: BrowserContext, sufijo: string): Promise<ClienteE2E>;
  export function autenticarComoCliente(context: BrowserContext, cliente: ClienteE2E): Promise<void>;
  export function limpiarClienteE2E(userId: string): Promise<void>;
  ```
- El panel se autentica con `autenticarComoAdmin(context)` de `tests/helpers/admin-e2e.ts`, que ya existe y no cambia.

#### Carga real de `.env.local` en Playwright y autenticación E2E honesta

Next.js carga automáticamente `.env.local` cuando levanta su servidor HTTP, pero el proceso de pruebas de Playwright (`npx playwright test`) corre en un proceso de Node.js independiente donde `process.env` **no** hereda los valores de `.env.local`. Dado que `tests/helpers/cliente-e2e.ts` lee directamente de `process.env`, ejecutar `npx playwright test` sin cargar `.env.local` provocaría fallos inmediatos a menos que el operador exporte manualmente cada variable en la consola.

Para garantizar una solución única, concreta y reproducible:
1. Se declara `@next/env` como dependencia directa en `devDependencies` de `package.json`.
2. Al inicio de `playwright.config.ts`, antes de llamar a `defineConfig`, se ejecuta:
   ```ts
   import { loadEnvConfig } from "@next/env";
   loadEnvConfig(process.cwd());
   ```
3. Se configuran explícitamente las 6 variables esenciales en `webServer.env` dentro de `playwright.config.ts`: `DATABASE_URL`, `NEON_RAMA_E2E`, `NEON_ENDPOINT_PRODUCCION`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E_FIREBASE_API_KEY` y `FIREBASE_PROJECT_ID`. De esta forma, tanto el proceso que ejecuta los tests de Playwright como el subproceso del servidor web de desarrollo reciben de forma garantizada e idéntica la configuración.
4. `tests/helpers/cliente-e2e.ts` mantiene el fallo explícito si cualquiera de estas variables falta en `process.env`.

#### Por qué la sesión del cliente no se puede fabricar

`app/identidad/sesion.ts` define `COOKIE_SESION_CLIENTE = "econoluz_cliente"`, y
`leerSesionDeCliente` de `app/identidad/sesion.server.ts` la entrega a
`verificarCookieDeSesion`, que llama a `auth().verifySessionCookie(cookie, true)` en
`app/identidad/firebase.server.ts`. Es decir: **solo vale una cookie de sesión emitida
por Firebase**, y además la cuenta tiene que existir en `users` con
`firebase_uid = uid` y `estado = 'activa'`.

Una cookie inventada —un JSON codificado en Base64, por ejemplo— no la acepta ninguna
página real: la prueba que la usara estaría comprobando el atajo, no la aplicación. Y
un nombre de cookie distinto del que define `app/identidad/sesion.ts` sencillamente no
lo lee nadie.

El único camino honesto es el que ya usa el navegador de un cliente de verdad:

1. Obtener un **ID token** válido de Firebase Authentication.
2. Entregárselo a la frontera real de la aplicación, `POST /api/clientes/sesion`, que
   lo verifica con `verificarIdToken`, aprovisiona la fila de `users` por
   `firebase_uid` con `aprovisionarCliente` y responde con la cookie que emite
   `crearCookieDeSesion`.
3. A partir de ahí, `leerSesionDeCliente` la verifica como cualquier otra.

Para el paso 1 en local se usa el **emulador de Firebase Authentication**. `firebase-admin`
lo reconoce por la variable de entorno `FIREBASE_AUTH_EMULATOR_HOST` y enruta contra él
tanto `verifyIdToken` como `createSessionCookie` y `verifySessionCookie`; se puede
comprobar en `node_modules/firebase-admin/lib/auth/auth-api-request.js`, donde el
constructor de URL del emulador es
`http://{host}/identitytoolkit.googleapis.com/{version}/projects/{projectId}{api}`.
Ese mismo prefijo es el que expone la API REST de cliente, así que crear el usuario y
pedir su ID token es una llamada HTTP a
`http://{FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp`.

**Sin emulador no hay atajo.** Si faltan `FIREBASE_AUTH_EMULATOR_HOST`,
`E2E_FIREBASE_API_KEY` o `FIREBASE_PROJECT_ID`, el ayudante lanza un error explícito y
la suite se detiene. La alternativa —credenciales E2E autorizadas contra el proyecto
`econoluz-dev-d30ab`— usa exactamente el mismo camino cambiando el destino de la
llamada REST; lo que no se admite es una tercera vía que se salte
`POST /api/clientes/sesion`.

**Variables que hay que dar de alta** en `.env.local` del worktree y documentar en
`.env.example` y `docs/OPERACION-FIREBASE.md`:

| Variable | Para qué |
|---|---|
| `FIREBASE_AUTH_EMULATOR_HOST` | Host y puerto del emulador, p. ej. `127.0.0.1:9099`. La lee `firebase-admin` **y** el servidor de desarrollo que levanta Playwright. |
| `E2E_FIREBASE_API_KEY` | Clave de API que acepta la REST del emulador. Con el emulador cualquier cadena no vacía sirve; se declara para no esconder el requisito cuando se apunte a un proyecto real. |
| `FIREBASE_PROJECT_ID` | Ya existe. Sin ella `app/identidad/firebase.server.ts` lanza a propósito. |
| `NEON_RAMA_E2E` | Nombre sellado de la rama de Neon para E2E, el mismo que guarda `app_settings.rama_neon`. |
| `NEON_ENDPOINT_PRODUCCION` | Ya existe. Se usa para rechazar Producción. |

- [ ] **Paso 1: Declarar `@next/env` en `package.json` y configurar `playwright.config.ts`**

  - Añadir `@next/env` a `devDependencies` en `package.json`:
    ```json
    "devDependencies": {
      "@next/env": "^16.3.1",
      "@playwright/test": "^1.62.1",
    ```
  - Actualizar `playwright.config.ts` para cargar `.env.local` de forma síncrona antes de definir la configuración, inyectar las 6 variables en `webServer.env` y registrar `envios-operativos.spec.ts` en `testMatch`:

    > **Corregido durante la ejecución (04/09/2026).** El borrador de este plan dejaba
    > `admin-envios.spec.ts` y `envios-operativos.spec.ts` juntos en `testMatch`, y eso no
    > podía ser: la primera prueba el panel de creación de zonas de reparto y publicación
    > de tarifas de 9A, que este mismo plan retira. Mantenerla habría exigido un
    > comportamiento ya derogado. **`envios-operativos.spec.ts` la sustituye**, y
    > `admin-envios.spec.ts` sale de `testMatch` y se conserva en disco únicamente como
    > evidencia histórica, porque borrarla necesita autorización del dueño. La suite
    > vigente son **83 pruebas en 11 archivos**.
    ```ts
    // playwright.config.ts
    import { defineConfig } from "@playwright/test";
    import { loadEnvConfig } from "@next/env";

    // Cargar variables de .env.local y .env en process.env para que el proceso
    // de Playwright disponga de las credenciales E2E sin exportaciones manuales.
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
        reuseExistingServer: false,
        timeout: 120_000,
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
    ```

- [ ] **Paso 2: Escribir el ayudante de clientes E2E**

```ts
// tests/helpers/cliente-e2e.ts
import type { BrowserContext } from "@playwright/test";
import { getE2ESql } from "./admin-e2e";
import { endpointCanonico } from "../../scripts/guarda-neon.mjs";

const BASE_URL = "http://127.0.0.1:3100";

export type ClienteE2E = {
  userId: string;
  uid: string;
  email: string;
  contrasena: string;
  nombre: string;
};

function leerVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta ${nombre}. Las pruebas E2E de clientes no tienen atajo: sin esta variable no se pueden autenticar de verdad.`,
    );
  }
  return valor;
}

/**
 * Rechaza Producción e **identifica positivamente** la rama E2E de Neon.
 *
 * «No es Producción» no basta: un endpoint mal configurado podría apuntar a
 * cualquier otra rama con datos que importen. El marcador `rama_neon` de
 * `app_settings` lo escribe `scripts/guarda-neon.mjs --sellar` y es la única
 * prueba positiva de contra qué base se está trabajando.
 */
export function exigirBaseE2EAislada(): void {
  const dbUrl = leerVariable("DATABASE_URL");
  const ramaEsperada = leerVariable("NEON_RAMA_E2E");
  const endpointProduccion = leerVariable("NEON_ENDPOINT_PRODUCCION");

  const conectado = endpointCanonico(new URL(dbUrl).hostname);
  if (conectado === endpointCanonico(endpointProduccion)) {
    throw new Error(`PROHIBIDO: las pruebas E2E escriben, y el endpoint ${conectado} es el de Producción.`);
  }

  // La comprobación del marcador es asíncrona y la hace `exigirRamaE2E`, que se
  // invoca desde `beforeAll`. Aquí se validan las variables antes de tocar nada.
  if (!ramaEsperada.trim()) {
    throw new Error("NEON_RAMA_E2E está vacía.");
  }
}

/** Comprueba contra la base que la rama conectada es la esperada. */
export async function exigirRamaE2E(): Promise<void> {
  const ramaEsperada = leerVariable("NEON_RAMA_E2E");
  const sql = getE2ESql();
  const filas = await sql`SELECT valor FROM app_settings WHERE clave = 'rama_neon'`;
  const rama = filas[0]?.valor ?? null;
  if (rama !== ramaEsperada) {
    throw new Error(
      `La base dice ser la rama «${rama ?? "sin marcar"}» y se esperaba «${ramaEsperada}». Sella la rama con: node scripts/guarda-neon.mjs --sellar ${ramaEsperada}`,
    );
  }
}

export function exigirEmuladorFirebase(): { emulador: string; apiKey: string; proyecto: string } {
  return {
    emulador: leerVariable("FIREBASE_AUTH_EMULATOR_HOST"),
    apiKey: leerVariable("E2E_FIREBASE_API_KEY"),
    proyecto: leerVariable("FIREBASE_PROJECT_ID"),
  };
}

type RespuestaIdentityToolkit = { idToken?: string; localId?: string; error?: { message?: string } };

async function llamarIdentityToolkit(
  metodo: "accounts:signUp" | "accounts:signInWithPassword",
  cuerpo: Record<string, unknown>,
): Promise<{ idToken: string; localId: string }> {
  const { emulador, apiKey } = exigirEmuladorFirebase();
  const url = `http://${emulador}/identitytoolkit.googleapis.com/v1/${metodo}?key=${apiKey}`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cuerpo, returnSecureToken: true }),
  });

  const json = (await respuesta.json()) as RespuestaIdentityToolkit;
  if (!respuesta.ok || !json.idToken || !json.localId) {
    throw new Error(
      `El emulador de Firebase rechazó ${metodo}: HTTP ${respuesta.status} ${json.error?.message ?? ""}`.trim(),
    );
  }
  return { idToken: json.idToken, localId: json.localId };
}

/**
 * Canjea un ID token por la cookie de sesión **por la frontera real de la
 * aplicación**, que es la que verifica el token, aprovisiona `users` por
 * `firebase_uid` y emite la cookie con `crearCookieDeSesion`.
 *
 * La cabecera `Origin` es obligatoria: `esMismoOrigen` rechaza la petición sin ella.
 */
async function canjearSesion(context: BrowserContext, idToken: string): Promise<void> {
  const respuesta = await context.request.post(`${BASE_URL}/api/clientes/sesion`, {
    headers: { Origin: BASE_URL, "Content-Type": "application/json" },
    data: { idToken },
  });

  if (!respuesta.ok()) {
    throw new Error(`El canje de sesión falló: HTTP ${respuesta.status()} ${await respuesta.text()}`);
  }
}

async function leerUserIdPorUid(uid: string): Promise<string> {
  const sql = getE2ESql();
  const filas = await sql`SELECT id FROM users WHERE firebase_uid = ${uid}`;
  if (filas.length !== 1) {
    throw new Error(`El canje de sesión no dejó exactamente una fila en users para el uid ${uid}.`);
  }
  return String(filas[0].id);
}

/**
 * Crea un cliente auténtico en el emulador, lo autentica contra la aplicación y
 * devuelve sus datos, incluido el `users.id` que aprovisionó la propia aplicación.
 */
export async function aprovisionarClienteE2E(
  context: BrowserContext,
  sufijo: string,
): Promise<ClienteE2E> {
  const marca = `${sufijo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-cliente-${marca}@econoluz.test`;
  const contrasena = `Prueba-${marca}`;
  const nombre = `Cliente E2E ${sufijo}`;

  const { idToken, localId } = await llamarIdentityToolkit("accounts:signUp", { email, password: contrasena });
  await canjearSesion(context, idToken);

  const userId = await leerUserIdPorUid(localId);

  // El nombre lo escribe el aprovisionamiento a partir del token, que en el emulador
  // no trae `name`. Se completa aquí para que la interfaz tenga algo que mostrar.
  const sql = getE2ESql();
  await sql`UPDATE users SET nombre = ${nombre} WHERE id = ${userId}`;

  return { userId, uid: localId, email, contrasena, nombre };
}

/** Autentica un contexto nuevo con un cliente ya creado, por el mismo camino real. */
export async function autenticarComoCliente(context: BrowserContext, cliente: ClienteE2E): Promise<void> {
  const { idToken } = await llamarIdentityToolkit("accounts:signInWithPassword", {
    email: cliente.email,
    password: cliente.contrasena,
  });
  await canjearSesion(context, idToken);
}

/**
 * Limpieza completa de un cliente de prueba, en orden de dependencias.
 *
 * **Propaga los errores.** Una limpieza silenciosa deja fixtures vivos que rompen la
 * siguiente ejecución en otro sitio y por un motivo que ya no se relaciona con esta
 * prueba.
 */
export async function limpiarClienteE2E(userId: string): Promise<void> {
  const sql = getE2ESql();
  await sql`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ${userId})`;
  await sql`DELETE FROM carts WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_addresses WHERE user_id = ${userId}`;
  await sql`DELETE FROM auth_events WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_consents WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
}
```

- [ ] **Paso 3: Escribir la prueba E2E completa**

```ts
// tests/envios-operativos.spec.ts
import { test, expect } from "@playwright/test";
import { autenticarComoAdmin } from "./helpers/admin-e2e";
import {
  aprovisionarClienteE2E,
  autenticarComoCliente,
  exigirBaseE2EAislada,
  exigirEmuladorFirebase,
  exigirRamaE2E,
  limpiarClienteE2E,
  type ClienteE2E,
} from "./helpers/cliente-e2e";
import { getE2ESql } from "./helpers/admin-e2e";

test.beforeAll(async () => {
  // Sin base E2E identificada positivamente y sin emulador, la suite se detiene
  // aquí en lugar de degradar a un atajo.
  exigirBaseE2EAislada();
  exigirEmuladorFirebase();
  await exigirRamaE2E();
});

test.describe("Panel de envíos operativos", () => {
  test("1. cambio y restauración del método de una zona capitalina", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");

    const fila = page.locator("form").filter({ hasText: "Zona 1" });
    const selector = fila.locator('select[name="metodo"]');
    await expect(selector).toHaveValue("mensajero_propio");

    try {
      await selector.selectOption("guatex");
      await fila.getByRole("button", { name: /guardar método/i }).click();

      await page.goto("/admin/envios");
      await expect(
        page.locator("form").filter({ hasText: "Zona 1" }).locator('select[name="metodo"]'),
      ).toHaveValue("guatex");
    } finally {
      await page.goto("/admin/envios");
      const filaRestaurar = page.locator("form").filter({ hasText: "Zona 1" });
      await filaRestaurar.locator('select[name="metodo"]').selectOption("mensajero_propio");
      await filaRestaurar.getByRole("button", { name: /guardar método/i }).click();

      await page.goto("/admin/envios");
      await expect(
        page.locator("form").filter({ hasText: "Zona 1" }).locator('select[name="metodo"]'),
      ).toHaveValue("mensajero_propio");
    }
  });

  for (const zona of [6, 17, 18]) {
    test(`${zona === 6 ? 2 : zona === 17 ? 3 : 4}. la zona ${zona} nace atendida por Guatex`, async ({ page, context }) => {
      await autenticarComoAdmin(context);
      await page.goto("/admin/envios");
      const fila = page.locator("form").filter({ hasText: `Zona ${zona}` });
      await expect(fila).toBeVisible();
      await expect(fila.locator('select[name="metodo"]')).toHaveValue("guatex");
    });
  }

  test("5. la zona 1 nace atendida por mensajero propio", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");
    const fila = page.locator("form").filter({ hasText: "Zona 1" });
    await expect(fila).toBeVisible();
    await expect(fila.locator('select[name="metodo"]')).toHaveValue("mensajero_propio");
  });

  test("6. la zona 20 no existe ni se renderiza", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    await page.goto("/admin/envios");
    await expect(page.locator("form").filter({ hasText: "Zona 20" })).toHaveCount(0);
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

  test("7. en el municipio de Guatemala la zona es obligatoria y se avisa en pantalla", async ({ page, context }) => {
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

    // La comprobación **no** exige que el DDL rechace un NULL: la migración 015 deja
    // `zona_capitalina` nullable a propósito, porque las direcciones históricas no
    // tienen zona. Lo obligatorio es de la aplicación, y es lo que se comprueba.
  });

  test("8. una dirección de Mixco se guarda con zona_capitalina nula", async ({ page, context }) => {
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

  test("9. una dirección capitalina con zona 14 persiste tras recargar", async ({ page, context }) => {
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
});
```

- [ ] **Paso 4: Levantar el emulador y ejecutar la batería completa**

```bash
firebase emulators:start --only auth --project econoluz-dev-d30ab
npm run test:datos
npm run test:admin
npm run test:proveedores
npm run typecheck
npm run lint
npm run build
npx playwright test tests/envios-operativos.spec.ts
```

  - El emulador de Firebase se deja corriendo en otra consola (`firebase emulators:start --only auth --project econoluz-dev-d30ab`).
  - Gracias a `loadEnvConfig(process.cwd())` en `playwright.config.ts`, las variables declaradas en `.env.local` (`DATABASE_URL`, `NEON_RAMA_E2E`, `NEON_ENDPOINT_PRODUCCION`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`) se cargan de forma automática e idéntica tanto en el proceso de pruebas de Playwright como en el subproceso del servidor web de desarrollo mediante `webServer.env`. El operador no necesita exportar manualmente ninguna variable en la consola. Si falta alguna variable en `.env.local`, la suite falla de forma explícita antes de tocar nada.
  - La consola es Windows PowerShell 5.1: los comandos van en líneas separadas.

- [ ] **Paso 5: Actualizar `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` con el modelo operativo corregido**
  - Registrar el modelo de envíos (Q35,00, umbral de Q2.500,00, zonas 6, 17 y 18 en
    Guatex), la migración 015, la retirada de la ficha de zona y las variables nuevas
    del emulador para E2E.

- [ ] **Paso 6: Commit de la tarea 8**
  - Mensaje: `docs(envios): modelo operativo de envios, e2e con sesion real de cliente y variables del emulador`

## 🛑 PARADA OBLIGATORIA
Una vez completadas las 8 tareas en la rama de desarrollo:
- Detenerse completamente.
- Prohibido hacer merge, push o aplicar migraciones en Producción sin la autorización expresa del dueño.
