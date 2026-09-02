# Fase C del catálogo relacional — modo `shadow` — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:executing-plans` (o `superpowers:subagent-driven-development`) para
> ejecutar tarea a tarea. Los pasos llevan casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** que el catálogo lea en paralelo el modelo relacional, compare su resultado
con el del catálogo antiguo y registre las diferencias de forma segura, **sin cambiar ni
un byte de lo que recibe el visitante**, que sigue siendo el resultado `legacy`.

**Arquitectura:** un selector tipado puro decide qué camino sirve cada modelo; un
comparador puro traduce ambos catálogos a una representación canónica **sin ningún dato
del proveedor** y devuelve las diferencias; una capa `server-only` conecta las dos
lecturas reales, aplica un presupuesto de eventos y registra. `catalog.server.ts` solo
gana el enganche: su lectura `legacy` no se toca.

**Stack:** TypeScript, Next 16, `node:test`, `@neondatabase/serverless`, Neon, Vercel.

**Diseño:** `docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md` §5.

**Fase anterior:** `docs/superpowers/plans/2026-09-02-catalogo-relacional-fase-b.md`.

## Restricciones globales

- **El visitante recibe siempre `legacy`** mientras dure esta fase. `shadow` no puede
  alterar el valor devuelto ni su orden.
- **`relational_v2` no se activa.** Ni en Neon, ni en Vercel, ni en Producción.
- **Ninguna escritura durante la lectura.** La comparación solo emite `select`.
- **Ningún dato privado sale nunca**: `supplier_code`, `supplier_brand`,
  `supplier_series`, `supplier_name`, `supplier_description` y sus etiquetas no entran en
  la representación canónica, ni en las diferencias, ni en los registros, ni en los
  errores. Tampoco cadenas de conexión ni credenciales.
- Los eventos solo pueden llevar: identificador público, tipo de diferencia, nombre del
  campo público, conteos, huellas irreversibles, duración e identificador de correlación.
- **Solo se escribe en la rama Neon `catalogo-relacional-fase-b`**
  (`br-quiet-hat-avozt905`, endpoint `ep-green-union-avi3x99e`). Producción
  (`br-flat-dew-avc2njed`, endpoint `ep-misty-sun-avmcbgly`) no se toca.
- Sin `push`, sin `merge`, sin despliegue de Production, sin borrar la rama de Neon.
- Comentarios, mensajes de commit y documentación **en español de España**.
- Las credenciales viven únicamente en variables temporales del shell. Nunca en archivos,
  documentación, commits ni salida final.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/data/catalogo/comparacion.ts` **(nuevo, puro)** | Representación canónica de un catálogo desde cada fuente y el motor de diferencias. Sin red, sin `server-only`, sin datos privados. |
| `app/data/catalogo/seleccion.ts` **(nuevo, puro)** | El selector tipado `legacy` / `shadow` / `relational_v2` y la llave de la Fase D. |
| `app/data/catalogo/comparacion.server.ts` **(nuevo, `server-only`)** | Conecta las lecturas reales con la conexión de la aplicación y el registro estructurado. |
| `app/data/catalog.server.ts` **(modificado)** | Solo el enganche del selector. La lectura `legacy` no cambia. |
| `scripts/comparar-catalogo-shadow.mjs` **(nuevo)** | Comparación completa contra la rama aislada, en transacción de solo lectura. |
| `scripts/modelo-catalogo.mjs` **(nuevo)** | Leer y cambiar `modelo_catalogo`, con el guardián de rama. |
| `tests/catalogo-comparacion.test.ts` **(nuevo)** | Canónico, diferencias, orden, consultas y límites. |
| `tests/catalogo-seleccion.test.ts` **(nuevo)** | Los tres modos y la llave de la Fase D. |
| `tests/catalogo-shadow-privacidad.test.ts` **(nuevo)** | Centinelas privados en resultados, errores y registros. |
| `package.json` **(modificado)** | Dos comandos nuevos y las tres pruebas dentro de `test:datos`. |
| `docs/CONTINUAR-PANEL.md`, `CLAUDE.md` **(modificados)** | Estado operativo al cierre. |

---

## Tarea 1 — La representación canónica

**Archivos:**
- Crear: `app/data/catalogo/comparacion.ts`
- Prueba: `tests/catalogo-comparacion.test.ts`

**Interfaces que produce:**

```ts
export type ImagenCanonica = {
  url: string; alt: string; posicion: number; visible: boolean; principal: boolean;
};
export type AtributoCanonico = {
  clave: string; nombre: string; unidad: string | null;
  numero: number | null; texto: string | null; booleano: boolean | null; opcion: string | null;
};
export type ProductoCanonico = {
  id: string;                 // identificador público (la referencia en minúsculas)
  referencia: string;         // ECO-…
  publicado: boolean;
  orden: number;              // products.position
  categorias: string[];       // slugs, ordenados alfabéticamente
  categoriaPrincipal: string | null;
  imagenes: ImagenCanonica[]; // ordenadas por posición y url
  atributos: AtributoCanonico[]; // ordenados por clave
  precioNormalCentavos: number | null;
  precioPromocionCentavos: number | null;
  proyeccion: FilaProyeccion;
};
export type CatalogoCanonico = { orden: string[]; productos: ProductoCanonico[] };

export function canonicoDesdeLegacy(fila: FilaDeCatalogo): ProductoCanonico;
export function canonicoDesdeRelacional(p: ProductoRelacional, ahora: Date): ProductoCanonico;
export function catalogoCanonicoDesdeLegacy(filas: readonly FilaDeCatalogo[]): CatalogoCanonico;
export function catalogoCanonicoDesdeRelacional(
  productos: readonly ProductoRelacional[], ahora: Date,
): CatalogoCanonico;
```

`orden` contiene los ids **publicados** en el orden en que se sirven (`position`, y a
igualdad, `id`). Es la única dimensión donde el orden significa algo; las colecciones de
dentro se ordenan igual en los dos lados para que su orden de llegada desde Postgres no
genere falsos positivos.

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
// tests/catalogo-comparacion.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicoDesdeLegacy,
  canonicoDesdeRelacional,
  catalogoCanonicoDesdeLegacy,
} from "../app/data/catalogo/comparacion";
import type { FilaDeCatalogo } from "../app/data/catalogo/importacion";
import type { ProductoRelacional } from "../app/data/catalogo/lectura";

const FILA: FilaDeCatalogo = {
  id: "apl-001",
  econoluz_reference: "ECO-ELE-0001",
  position: 10,
  public_name: "Módulo eléctrico apagador",
  public_description: "Módulo apagador de un interruptor.",
  image: "/catalogos/electrico/apl-001.png",
  images: ["/catalogos/electrico/apl-001-b.png"],
  technical_specs: { amperage: "15 A" },
  product_type: "placas_accesorios",
  product_type_label: "Placas y accesorios",
  application: "placas_apagadores",
  application_label: "Placas y apagadores",
  finish: "blanco_brillante",
  finish_label: "Blanco brillante",
  family_label: "Placas",
  supplier_brand: "artlite",
  supplier_brand_label: "Artlite",
  supplier_series: "linea_artlite",
  supplier_series_label: "Línea Artlite",
  supplier_code: "APL-001",
  supplier_name: "Modulo apagador ARTLITE APL-001",
  supplier_description: "Modulo apagador de 1 interruptor.",
  price_gtq: 125,
  published: true,
};

const RELACIONAL: ProductoRelacional = {
  id: "apl-001",
  nucleo: {
    econoluz_reference: "ECO-ELE-0001",
    position: 10,
    public_name: "Módulo eléctrico apagador",
    public_description: "Módulo apagador de un interruptor.",
    image: "/catalogos/electrico/apl-001.png",
    images: ["/catalogos/electrico/apl-001-b.png"],
    technical_specs: { amperage: "15 A" },
    product_type: "placas_accesorios",
    product_type_label: "Placas y accesorios",
    application: "placas_apagadores",
    application_label: "Placas y apagadores",
    finish: "blanco_brillante",
    finish_label: "Blanco brillante",
    family_label: "Placas",
    published: true,
  },
  privados: {
    supplier_brand: "artlite",
    supplier_brand_label: "Artlite",
    supplier_series: "linea_artlite",
    supplier_series_label: "Línea Artlite",
    supplier_code: "APL-001",
    supplier_name: "Modulo apagador ARTLITE APL-001",
    supplier_description: "Modulo apagador de 1 interruptor.",
  },
  categorias: [
    {
      id: "7",
      parentId: "1",
      slug: "placas-accesorios-placas-apagadores",
      nombre: "Placas y apagadores",
      principal: true,
    },
  ],
  imagenes: [
    { id: "1", url: "/catalogos/electrico/apl-001.png", alt: "Módulo eléctrico apagador",
      posicion: 0, visible: true, principal: true },
    { id: "2", url: "/catalogos/electrico/apl-001-b.png", alt: "Módulo eléctrico apagador",
      posicion: 10, visible: true, principal: false },
  ],
  atributos: [
    { id: "9", atributoId: "3", clave: "amperage", nombre: "Amperaje", tipo: "numero",
      unidad: "A", filterable: true, comparable: true, active: true,
      valueNumber: 15, valueText: null, valueBool: null,
      optionId: null, optionClave: null, optionEtiqueta: null },
  ],
  precios: [{ id: "5", centavos: 12500, tipo: "normal", desde: null, hasta: null }],
};

const AHORA = new Date("2026-09-02T12:00:00Z");

test("el canónico de un producto no contiene ningún dato del proveedor", () => {
  const texto = JSON.stringify(canonicoDesdeLegacy(FILA));
  for (const privado of ["APL-001", "artlite", "Artlite", "linea_artlite", "Línea Artlite",
                         "Modulo apagador ARTLITE APL-001",
                         "Modulo apagador de 1 interruptor."]) {
    assert.equal(texto.includes(privado), false, `se coló ${privado}`);
  }
});

test("las dos fuentes producen exactamente el mismo canónico", () => {
  assert.deepEqual(canonicoDesdeRelacional(RELACIONAL, AHORA), canonicoDesdeLegacy(FILA));
});

test("el canónico usa el identificador público, no el id interno", () => {
  assert.equal(canonicoDesdeLegacy(FILA).id, "eco-ele-0001");
});

test("el orden del catálogo solo lleva los productos publicados", () => {
  const oculto = { ...FILA, id: "apl-002", econoluz_reference: "ECO-ELE-0002",
                   position: 20, published: false };
  const canonico = catalogoCanonicoDesdeLegacy([FILA, oculto]);
  assert.deepEqual(canonico.orden, ["eco-ele-0001"]);
  assert.equal(canonico.productos.length, 2);
});

test("el orden respeta position y no el orden de llegada", () => {
  const segundo = { ...FILA, id: "apl-002", econoluz_reference: "ECO-ELE-0002", position: 5 };
  assert.deepEqual(
    catalogoCanonicoDesdeLegacy([FILA, segundo]).orden,
    ["eco-ele-0002", "eco-ele-0001"],
  );
});

test("el orden de llegada de imágenes, categorías y atributos no cambia el canónico", () => {
  const revuelto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: [...RELACIONAL.imagenes].reverse(),
    atributos: [...RELACIONAL.atributos].reverse(),
    categorias: [...RELACIONAL.categorias].reverse(),
  };
  assert.deepEqual(
    canonicoDesdeRelacional(revuelto, AHORA),
    canonicoDesdeRelacional(RELACIONAL, AHORA),
  );
});

test("una promoción vigente se compara aparte del precio normal", () => {
  const conPromocion: ProductoRelacional = {
    ...RELACIONAL,
    precios: [...RELACIONAL.precios,
              { id: "6", centavos: 9900, tipo: "promocion", desde: null, hasta: null }],
  };
  const canonico = canonicoDesdeRelacional(conPromocion, AHORA);
  assert.equal(canonico.precioNormalCentavos, 12500);
  assert.equal(canonico.precioPromocionCentavos, 9900);
});
```

- [ ] **Paso 2: verlas fallar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

Esperado: FALLA porque `app/data/catalogo/comparacion.ts` no existe.

- [ ] **Paso 3: implementar la parte canónica de `comparacion.ts`**

```ts
/**
 * La representación canónica con la que se comparan el catálogo antiguo y el relacional.
 *
 * Módulo puro: sin red, sin base de datos y sin `server-only`, para poder probarlo entero.
 *
 * **Aquí no entra ni un dato del proveedor.** El canónico se construye campo a campo, no
 * copiando objetos, precisamente para que añadir mañana una columna privada a `products`
 * no arrastre el dato hasta un registro. Lo que no se nombra aquí no puede salir.
 *
 * Cada lado se traduce con la transformación **acordada**: las categorías y los atributos
 * del lado antiguo salen de `planificarProducto`, que es el contrato de importación
 * aprobado el 02/09/2026. Las imágenes, en cambio, se derivan aquí del modo literal en que
 * hoy las sirve el catálogo —principal primero y galería después, **sin quitar
 * repetidas**—, para que la deduplicación que sí hace el importador aparezca como
 * diferencia real en vez de quedar escondida.
 */

import { fromProductRow, type ProductRow } from "../productRow";
import { aFilaProyeccion, type FilaProyeccion } from "../proyeccionPublica";
import { planificarProducto, type FilaDeCatalogo } from "./importacion";
import { proyeccionDesdeRelacional, type ProductoRelacional } from "./lectura";
import { preciosVigentes } from "./precios";

export type ImagenCanonica = {
  url: string;
  alt: string;
  posicion: number;
  visible: boolean;
  principal: boolean;
};

export type AtributoCanonico = {
  clave: string;
  nombre: string;
  unidad: string | null;
  numero: number | null;
  texto: string | null;
  booleano: boolean | null;
  opcion: string | null;
};

export type ProductoCanonico = {
  id: string;
  referencia: string;
  publicado: boolean;
  orden: number;
  categorias: string[];
  categoriaPrincipal: string | null;
  imagenes: ImagenCanonica[];
  atributos: AtributoCanonico[];
  precioNormalCentavos: number | null;
  precioPromocionCentavos: number | null;
  proyeccion: FilaProyeccion;
};

export type CatalogoCanonico = { orden: string[]; productos: ProductoCanonico[] };

/** El mismo hueco entre posiciones que usa el importador. */
const PASO_DE_POSICION = 10;

const porPosicionYUrl = (a: ImagenCanonica, b: ImagenCanonica) =>
  a.posicion - b.posicion || a.url.localeCompare(b.url);

const porClave = (a: AtributoCanonico, b: AtributoCanonico) => a.clave.localeCompare(b.clave);

/** El identificador público: el mismo que ya calcula `toPublicProduct`. */
const idPublico = (referencia: string) => referencia.toLowerCase();

export function canonicoDesdeLegacy(fila: FilaDeCatalogo): ProductoCanonico {
  const plan = planificarProducto(fila);

  const imagenes: ImagenCanonica[] = [fila.image, ...(fila.images ?? [])]
    .filter((url) => Boolean(url))
    .map((url, indice) => ({
      url,
      alt: fila.public_name,
      posicion: indice * PASO_DE_POSICION,
      visible: true,
      principal: indice === 0,
    }))
    .sort(porPosicionYUrl);

  const atributos: AtributoCanonico[] = plan.atributos
    .map((atributo) => ({
      clave: atributo.clave,
      nombre: atributo.nombre,
      unidad: atributo.unidad,
      numero: atributo.numero,
      texto: null,
      booleano: null,
      opcion: null,
    }))
    .sort(porClave);

  return {
    id: idPublico(fila.econoluz_reference),
    referencia: fila.econoluz_reference,
    publicado: fila.published,
    orden: fila.position,
    categorias: plan.categorias.map((categoria) => categoria.slug).sort(),
    categoriaPrincipal:
      plan.categorias.find((categoria) => categoria.principal)?.slug ?? null,
    imagenes,
    atributos,
    precioNormalCentavos: plan.precioNormalCentavos,
    // El catálogo antiguo no tiene promociones: solo la columna `price_gtq`.
    precioPromocionCentavos: null,
    proyeccion: aFilaProyeccion(
      fromProductRow(fila as unknown as ProductRow),
      fila.price_gtq,
      fila.position,
    ),
  };
}

export function canonicoDesdeRelacional(
  producto: ProductoRelacional,
  ahora: Date,
): ProductoCanonico {
  const { normal, promocion } = preciosVigentes(producto.precios, ahora);

  const imagenes: ImagenCanonica[] = producto.imagenes
    .map((imagen) => ({
      url: imagen.url,
      alt: imagen.alt,
      posicion: imagen.posicion,
      visible: imagen.visible,
      principal: imagen.principal,
    }))
    .sort(porPosicionYUrl);

  const atributos: AtributoCanonico[] = producto.atributos
    .map((atributo) => ({
      clave: atributo.clave,
      nombre: atributo.nombre,
      unidad: atributo.unidad,
      numero: atributo.valueNumber,
      texto: atributo.valueText,
      booleano: atributo.valueBool,
      opcion: atributo.optionClave,
    }))
    .sort(porClave);

  return {
    id: idPublico(producto.nucleo.econoluz_reference),
    referencia: producto.nucleo.econoluz_reference,
    publicado: producto.nucleo.published,
    orden: producto.nucleo.position,
    categorias: producto.categorias.map((categoria) => categoria.slug).sort(),
    categoriaPrincipal:
      producto.categorias.find((categoria) => categoria.principal)?.slug ?? null,
    imagenes,
    atributos,
    precioNormalCentavos: normal?.centavos ?? null,
    precioPromocionCentavos: promocion?.centavos ?? null,
    proyeccion: proyeccionDesdeRelacional(producto, ahora),
  };
}

function ordenar(productos: readonly ProductoCanonico[]): string[] {
  return productos
    .filter((producto) => producto.publicado)
    .slice()
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
    .map((producto) => producto.id);
}

export function catalogoCanonicoDesdeLegacy(
  filas: readonly FilaDeCatalogo[],
): CatalogoCanonico {
  const productos = filas.map(canonicoDesdeLegacy);
  return { orden: ordenar(productos), productos };
}

export function catalogoCanonicoDesdeRelacional(
  productos: readonly ProductoRelacional[],
  ahora: Date,
): CatalogoCanonico {
  const canonicos = productos.map((producto) => canonicoDesdeRelacional(producto, ahora));
  return { orden: ordenar(canonicos), productos: canonicos };
}
```

- [ ] **Paso 4: verlas pasar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

Esperado: las siete pruebas en verde.

- [ ] **Paso 5: commit**

```bash
git add app/data/catalogo/comparacion.ts tests/catalogo-comparacion.test.ts
git commit -m "feat(catalogo): representacion canonica para comparar los dos catalogos"
```

---

## Tarea 2 — El motor de diferencias

**Archivos:**
- Modificar: `app/data/catalogo/comparacion.ts`
- Prueba: `tests/catalogo-comparacion.test.ts`

**Interfaces que produce:**

```ts
export type TipoDeDiferencia =
  | "producto_ausente" | "producto_adicional"
  | "campo_distinto" | "coleccion_distinta" | "orden_distinto";
export type Diferencia = {
  tipo: TipoDeDiferencia;
  producto: string | null;   // identificador público, nunca el código del proveedor
  campo: string;             // nombre de campo público, p. ej. "proyeccion.public_name"
  huellaLegacy: string | null;
  huellaRelacional: string | null;
};
export type ResumenDeComparacion = {
  productosLegacy: number; productosRelacional: number; comparados: number;
  totalDiferencias: number;
  porTipo: Record<string, number>; porCampo: Record<string, number>;
  diferencias: Diferencia[]; omitidas: number;
};
export const LIMITE_DE_DIFERENCIAS = 25;
export function huella(valor: unknown): string;
export function compararCatalogos(
  legacy: CatalogoCanonico, relacional: CatalogoCanonico, limite?: number,
): ResumenDeComparacion;
```

- [ ] **Paso 1: escribir las pruebas que fallan**

Añadir a `tests/catalogo-comparacion.test.ts`:

```ts
import {
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  huella,
  LIMITE_DE_DIFERENCIAS,
} from "../app/data/catalogo/comparacion";

const legacyDe = (filas: FilaDeCatalogo[]) => catalogoCanonicoDesdeLegacy(filas);
const relacionalDe = (productos: ProductoRelacional[]) =>
  catalogoCanonicoDesdeRelacional(productos, AHORA);

test("dos catálogos equivalentes no producen ninguna diferencia", () => {
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([RELACIONAL]));
  assert.equal(resumen.totalDiferencias, 0);
  assert.deepEqual(resumen.diferencias, []);
  assert.equal(resumen.comparados, 1);
});

test("un producto que falta en el relacional se detecta como ausente", () => {
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([]));
  assert.equal(resumen.totalDiferencias, 1);
  assert.equal(resumen.diferencias[0].tipo, "producto_ausente");
  assert.equal(resumen.diferencias[0].producto, "eco-ele-0001");
});

test("un producto de más en el relacional se detecta como adicional", () => {
  const extra: ProductoRelacional = {
    ...RELACIONAL,
    id: "apl-002",
    nucleo: { ...RELACIONAL.nucleo, econoluz_reference: "ECO-ELE-0002", position: 20 },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([RELACIONAL, extra]));
  const adicional = resumen.diferencias.find((d) => d.tipo === "producto_adicional");
  assert.equal(adicional?.producto, "eco-ele-0002");
});

test("un campo público distinto se detecta con su nombre de campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, public_name: "Otro nombre" },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "proyeccion.public_name"),
    true,
  );
  assert.equal(resumen.diferencias.every((d) => d.tipo !== "producto_ausente"), true);
});

test("un precio distinto se detecta en su propio campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    precios: [{ id: "5", centavos: 999, tipo: "normal", desde: null, hasta: null }],
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.diferencias.some((d) => d.campo === "precioNormalCentavos"), true);
});

test("una categoría principal distinta se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    categorias: [{ ...RELACIONAL.categorias[0], slug: "otra-cosa" }],
  };
  const campos = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]))
    .diferencias.map((d) => d.campo);
  assert.equal(campos.includes("categorias"), true);
  assert.equal(campos.includes("categoriaPrincipal"), true);
});

test("una imagen principal distinta se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: RELACIONAL.imagenes.map((i) => ({ ...i, principal: !i.principal })),
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.diferencias.some((d) => d.campo === "imagenes"), true);
});

test("un atributo con otra unidad se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    atributos: [{ ...RELACIONAL.atributos[0], unidad: "mA" }],
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.diferencias.some((d) => d.campo === "atributos"), true);
});

test("el estado de publicación distinto se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, published: false },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.diferencias.some((d) => d.campo === "publicado"), true);
});

test("el orden de las colecciones internas no genera falsos positivos", () => {
  const revuelto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: [...RELACIONAL.imagenes].reverse(),
    atributos: [...RELACIONAL.atributos].reverse(),
    categorias: [...RELACIONAL.categorias].reverse(),
  };
  assert.equal(
    compararCatalogos(legacyDe([FILA]), relacionalDe([revuelto])).totalDiferencias,
    0,
  );
});

test("un orden de catálogo realmente distinto sí se detecta", () => {
  const segundaFila = { ...FILA, id: "apl-002",
    econoluz_reference: "ECO-ELE-0002", position: 20 };
  const segundoRelacional: ProductoRelacional = {
    ...RELACIONAL, id: "apl-002",
    nucleo: { ...RELACIONAL.nucleo, econoluz_reference: "ECO-ELE-0002", position: 5 },
  };
  const resumen = compararCatalogos(
    legacyDe([FILA, segundaFila]),
    relacionalDe([RELACIONAL, segundoRelacional]),
  );
  assert.equal(resumen.diferencias.some((d) => d.tipo === "orden_distinto"), true);
});

test("las diferencias se cuentan por tipo y por campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, public_name: "Otro nombre" },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.porTipo.campo_distinto >= 1, true);
  assert.equal(resumen.porCampo["proyeccion.public_name"], 1);
});

test("la lista de diferencias nunca crece sin límite", () => {
  const filas = Array.from({ length: 200 }, (_, i) => ({
    ...FILA, id: `p-${i}`,
    econoluz_reference: `ECO-ELE-${String(i).padStart(4, "0")}`, position: i,
  }));
  const resumen = compararCatalogos(legacyDe(filas), relacionalDe([]), LIMITE_DE_DIFERENCIAS);
  assert.equal(resumen.diferencias.length, LIMITE_DE_DIFERENCIAS);
  assert.equal(resumen.totalDiferencias >= 200, true);
  assert.equal(resumen.omitidas, resumen.totalDiferencias - LIMITE_DE_DIFERENCIAS);
});

test("la huella no deja recuperar el valor y distingue valores distintos", () => {
  assert.equal(huella("Módulo eléctrico apagador").includes("Módulo"), false);
  assert.equal(huella("a"), huella("a"));
  assert.notEqual(huella("a"), huella("b"));
  assert.equal(huella(null), huella(null));
});
```

- [ ] **Paso 2: verlas fallar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

Esperado: FALLA con «compararCatalogos is not a function» o el equivalente al importar.

- [ ] **Paso 3: implementar el motor**

Añadir a `app/data/catalogo/comparacion.ts`:

```ts
import { createHash } from "node:crypto";

export type TipoDeDiferencia =
  | "producto_ausente"
  | "producto_adicional"
  | "campo_distinto"
  | "coleccion_distinta"
  | "orden_distinto";

export type Diferencia = {
  tipo: TipoDeDiferencia;
  producto: string | null;
  campo: string;
  huellaLegacy: string | null;
  huellaRelacional: string | null;
};

export type ResumenDeComparacion = {
  productosLegacy: number;
  productosRelacional: number;
  comparados: number;
  totalDiferencias: number;
  porTipo: Record<string, number>;
  porCampo: Record<string, number>;
  diferencias: Diferencia[];
  omitidas: number;
};

/**
 * Cuántas diferencias se guardan como detalle. El resto se cuenta pero no se lista: 313
 * productos por doce dimensiones pueden dar miles de líneas, y un registro que crece con
 * el tamaño del catálogo es un registro que nadie lee y que además cuesta dinero.
 */
export const LIMITE_DE_DIFERENCIAS = 25;

/** JSON con las claves ordenadas, para que dos objetos iguales den la misma huella. */
function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, contenido]) => [clave, canonizar(contenido)]),
    );
  }
  return valor;
}

/**
 * Huella irreversible y corta de un valor.
 *
 * Se registra la huella y **nunca el valor**. Aunque el canónico solo contiene datos
 * públicos, registrar huellas mantiene la regla simple —«de aquí no sale contenido»— y
 * evita que un campo se cuele el día que alguien amplíe el canónico.
 */
export function huella(valor: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonizar(valor) ?? null))
    .digest("hex")
    .slice(0, 16);
}

const iguales = (a: unknown, b: unknown) =>
  JSON.stringify(canonizar(a)) === JSON.stringify(canonizar(b));

const CAMPOS_ESCALARES = [
  "referencia",
  "publicado",
  "orden",
  "categoriaPrincipal",
  "precioNormalCentavos",
  "precioPromocionCentavos",
] as const;

const CAMPOS_COLECCION = ["categorias", "imagenes", "atributos"] as const;

function diferenciasDeProyeccion(
  producto: string,
  legacy: FilaProyeccion,
  relacional: FilaProyeccion,
): Diferencia[] {
  const claves = [...new Set([...Object.keys(legacy), ...Object.keys(relacional)])].sort();
  const salida: Diferencia[] = [];
  for (const clave of claves) {
    const a = (legacy as unknown as Record<string, unknown>)[clave];
    const b = (relacional as unknown as Record<string, unknown>)[clave];
    if (iguales(a, b)) continue;
    salida.push({
      tipo: "campo_distinto",
      producto,
      campo: `proyeccion.${clave}`,
      huellaLegacy: huella(a),
      huellaRelacional: huella(b),
    });
  }
  return salida;
}

function diferenciasDeProducto(
  legacy: ProductoCanonico,
  relacional: ProductoCanonico,
): Diferencia[] {
  const salida: Diferencia[] = [];

  for (const campo of CAMPOS_ESCALARES) {
    if (iguales(legacy[campo], relacional[campo])) continue;
    salida.push({
      tipo: "campo_distinto",
      producto: legacy.id,
      campo,
      huellaLegacy: huella(legacy[campo]),
      huellaRelacional: huella(relacional[campo]),
    });
  }

  for (const campo of CAMPOS_COLECCION) {
    if (iguales(legacy[campo], relacional[campo])) continue;
    salida.push({
      tipo: "coleccion_distinta",
      producto: legacy.id,
      campo,
      huellaLegacy: huella(legacy[campo]),
      huellaRelacional: huella(relacional[campo]),
    });
  }

  return [
    ...salida,
    ...diferenciasDeProyeccion(legacy.id, legacy.proyeccion, relacional.proyeccion),
  ];
}

export function compararCatalogos(
  legacy: CatalogoCanonico,
  relacional: CatalogoCanonico,
  limite: number = LIMITE_DE_DIFERENCIAS,
): ResumenDeComparacion {
  const porIdRelacional = new Map(relacional.productos.map((p) => [p.id, p]));
  const porIdLegacy = new Map(legacy.productos.map((p) => [p.id, p]));

  const diferencias: Diferencia[] = [];
  const porTipo: Record<string, number> = {};
  const porCampo: Record<string, number> = {};
  let total = 0;
  let comparados = 0;

  const anotar = (diferencia: Diferencia) => {
    total += 1;
    porTipo[diferencia.tipo] = (porTipo[diferencia.tipo] ?? 0) + 1;
    porCampo[diferencia.campo] = (porCampo[diferencia.campo] ?? 0) + 1;
    if (diferencias.length < limite) diferencias.push(diferencia);
  };

  for (const producto of legacy.productos) {
    const pareja = porIdRelacional.get(producto.id);
    if (!pareja) {
      anotar({
        tipo: "producto_ausente",
        producto: producto.id,
        campo: "producto",
        huellaLegacy: huella(producto.referencia),
        huellaRelacional: null,
      });
      continue;
    }
    comparados += 1;
    for (const diferencia of diferenciasDeProducto(producto, pareja)) anotar(diferencia);
  }

  for (const producto of relacional.productos) {
    if (porIdLegacy.has(producto.id)) continue;
    anotar({
      tipo: "producto_adicional",
      producto: producto.id,
      campo: "producto",
      huellaLegacy: null,
      huellaRelacional: huella(producto.referencia),
    });
  }

  // El orden del catálogo sí significa algo: es el que ve el visitante. Se compara como
  // una secuencia, no como un conjunto.
  if (!iguales(legacy.orden, relacional.orden)) {
    anotar({
      tipo: "orden_distinto",
      producto: null,
      campo: "orden",
      huellaLegacy: huella(legacy.orden),
      huellaRelacional: huella(relacional.orden),
    });
  }

  return {
    productosLegacy: legacy.productos.length,
    productosRelacional: relacional.productos.length,
    comparados,
    totalDiferencias: total,
    porTipo,
    porCampo,
    diferencias,
    omitidas: Math.max(0, total - diferencias.length),
  };
}
```

- [ ] **Paso 4: verlas pasar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

- [ ] **Paso 5: commit**

```bash
git add app/data/catalogo/comparacion.ts tests/catalogo-comparacion.test.ts
git commit -m "feat(catalogo): motor de diferencias con huellas y presupuesto de eventos"
```

---

## Tarea 3 — El selector tipado y la llave de la Fase D

**Archivos:**
- Crear: `app/data/catalogo/seleccion.ts`
- Prueba: `tests/catalogo-seleccion.test.ts`

**Interfaces que produce:**

```ts
export const FASE_D_AUTORIZADA = false;
export function modeloEfectivo(
  modelo: ModeloDeCatalogo, faseDAutorizada?: boolean,
): ModeloDeCatalogo;
export type FuentesDeCatalogo<T> = {
  legacy: () => Promise<T>;
  relacional: () => Promise<T>;
  comparar: () => Promise<void>;
};
export async function servirSegunModelo<T>(
  modelo: ModeloDeCatalogo, fuentes: FuentesDeCatalogo<T>, faseDAutorizada?: boolean,
): Promise<T>;
```

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
// tests/catalogo-seleccion.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { interpretarModelo } from "../app/lib/ajustes";
import {
  FASE_D_AUTORIZADA,
  modeloEfectivo,
  servirSegunModelo,
} from "../app/data/catalogo/seleccion";

function fuentesEspia(alComparar?: () => Promise<void>) {
  const llamadas: string[] = [];
  return {
    llamadas,
    fuentes: {
      legacy: async () => { llamadas.push("legacy"); return "catálogo-legacy"; },
      relacional: async () => { llamadas.push("relacional"); return "catálogo-relacional"; },
      comparar: async () => {
        llamadas.push("comparar");
        if (alComparar) await alComparar();
      },
    },
  };
}

test("legacy no consulta el modelo relacional ni compara", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("legacy", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy"]);
});

test("shadow ejecuta ambos caminos pero devuelve exactamente legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("shadow", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy", "comparar"]);
});

test("un fallo de la comparación no rompe la respuesta legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia(async () => {
    throw new Error("la lectura relacional falló");
  });
  assert.equal(await servirSegunModelo("shadow", fuentes), "catálogo-legacy");
  assert.deepEqual(llamadas, ["legacy", "comparar"]);
});

test("mientras la Fase D no esté autorizada, relational_v2 sirve legacy", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("relational_v2", fuentes, false), "catálogo-legacy");
  assert.equal(llamadas.includes("relacional"), false);
});

test("con la Fase D autorizada, relational_v2 sirve el catálogo relacional", async () => {
  const { llamadas, fuentes } = fuentesEspia();
  assert.equal(await servirSegunModelo("relational_v2", fuentes, true), "catálogo-relacional");
  assert.deepEqual(llamadas, ["relacional"]);
});

test("la llave de la Fase D está cerrada en la Fase C", () => {
  assert.equal(FASE_D_AUTORIZADA, false);
  assert.equal(modeloEfectivo("relational_v2"), "shadow");
  assert.equal(modeloEfectivo("shadow"), "shadow");
  assert.equal(modeloEfectivo("legacy"), "legacy");
});

test("relational_v2 no se activa con ningún valor que no sea exactamente ese", () => {
  for (const valor of ["relational_v2 ", "RELATIONAL_V2", "relacional_v2", "v2", "",
                       null, undefined, 1, true, {}]) {
    assert.equal(interpretarModelo(valor), "legacy", `${String(valor)} no debe activar nada`);
  }
  assert.equal(interpretarModelo("relational_v2"), "relational_v2");
});
```

- [ ] **Paso 2: verlas fallar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-seleccion.test.ts
```

Esperado: FALLA porque `app/data/catalogo/seleccion.ts` no existe.

- [ ] **Paso 3: implementar el selector**

```ts
/**
 * Qué camino sirve el catálogo según la bandera `modelo_catalogo`.
 *
 * Módulo puro: recibe las fuentes y no conoce ninguna conexión, así que se prueba entero
 * sin base de datos. El enganche real vive en `app/data/catalog.server.ts`.
 *
 * ## La llave de la Fase D
 *
 * `relational_v2` está implementado y probado, pero **no se sirve** mientras
 * `FASE_D_AUTORIZADA` valga `false`: si alguien pusiera esa bandera en la base durante la
 * Fase C, el visitante seguiría recibiendo `legacy`. Activar la Fase D exige cambiar
 * código y desplegar, que es justo el trámite que el dueño quiere para ese paso.
 *
 * La vuelta atrás **no depende de esta llave**: poner `modelo_catalogo` en `legacy`
 * devuelve el catálogo antiguo en menos de un minuto y sin desplegar nada.
 */

import type { ModeloDeCatalogo } from "../../lib/ajustes";

/** Cerrada durante la Fase C. Solo la Fase D, con autorización expresa, la abre. */
export const FASE_D_AUTORIZADA = false;

export function modeloEfectivo(
  modelo: ModeloDeCatalogo,
  faseDAutorizada: boolean = FASE_D_AUTORIZADA,
): ModeloDeCatalogo {
  if (modelo === "relational_v2" && !faseDAutorizada) return "shadow";
  return modelo;
}

export type FuentesDeCatalogo<T> = {
  /** El camino probado. Es lo que recibe el visitante en `legacy` y en `shadow`. */
  legacy: () => Promise<T>;
  /** El camino nuevo. Solo se invoca con la Fase D autorizada. */
  relacional: () => Promise<T>;
  /** Lee el modelo relacional y compara. **No debe lanzar**; aun así se protege aquí. */
  comparar: () => Promise<void>;
};

export async function servirSegunModelo<T>(
  modelo: ModeloDeCatalogo,
  fuentes: FuentesDeCatalogo<T>,
  faseDAutorizada: boolean = FASE_D_AUTORIZADA,
): Promise<T> {
  const efectivo = modeloEfectivo(modelo, faseDAutorizada);

  if (efectivo === "relational_v2") return fuentes.relacional();

  const resultado = await fuentes.legacy();
  if (efectivo === "legacy") return resultado;

  // `shadow`: la respuesta del visitante ya está decidida y no puede cambiar por nada de
  // lo que ocurra a partir de aquí. Un fallo del modelo nuevo no rompe el antiguo.
  try {
    await fuentes.comparar();
  } catch {
    // `comparar` registra sus propios fallos saneados; aquí solo se impide que suban.
  }

  return resultado;
}
```

- [ ] **Paso 4: verlas pasar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-seleccion.test.ts
```

- [ ] **Paso 5: commit**

```bash
git add app/data/catalogo/seleccion.ts tests/catalogo-seleccion.test.ts
git commit -m "feat(catalogo): selector tipado del modelo con la llave de la fase d cerrada"
```

---

## Tarea 4 — La comparación real: lecturas, cronómetro y registro saneado

**Archivos:**
- Modificar: `app/data/catalogo/comparacion.ts`
- Crear: `app/data/catalogo/comparacion.server.ts`
- Modificar: `app/data/catalog.server.ts`
- Prueba: `tests/catalogo-comparacion.test.ts`

**Interfaces que consume:** `compararCatalogos` y `catalogoCanonicoDesde*` (tareas 1 y 2),
`servirSegunModelo` (tarea 3), `leerCatalogoRelacional(ejecutar)` de
`app/data/catalogo/lectura.ts`, `registrar` de `app/lib/datos`.

**Interfaces que produce:**

```ts
export const CONSULTA_LEGACY_COMPLETA: string;
export type Registro = (nivel: "info" | "error", suceso: string,
                        datos?: Record<string, string | number | boolean>) => void;
export async function ejecutarComparacion(
  ejecutar: Ejecutor, registro: Registro, ahora?: Date,
): Promise<ResumenDeComparacion | null>;
// app/data/catalogo/comparacion.server.ts
export async function compararCatalogoEnSombra(): Promise<void>;
```

`ejecutarComparacion` recibe el ejecutor, así que se prueba sin base de datos, y **nunca
lanza**: ante cualquier fallo registra `catalogo-shadow-error` con la causa saneada y
devuelve `null`.

- [ ] **Paso 1: escribir las pruebas que fallan**

Añadir a `tests/catalogo-comparacion.test.ts`:

```ts
import { ejecutarComparacion } from "../app/data/catalogo/comparacion";
import type { Ejecutor } from "../app/lib/datos/consulta";

function ejecutorFalso(respuestas: { patron: RegExp; filas: Record<string, unknown>[] }[]) {
  const sentencias: string[] = [];
  const ejecutar: Ejecutor = async (texto) => {
    sentencias.push(texto);
    return respuestas.find((r) => r.patron.test(texto))?.filas ?? [];
  };
  return { ejecutar, sentencias };
}

function registroEspia() {
  const lineas: { nivel: string; suceso: string; datos: Record<string, unknown> }[] = [];
  const registro = (nivel: "info" | "error", suceso: string, datos = {}) => {
    lineas.push({ nivel, suceso, datos });
  };
  return { lineas, registro };
}

const PATRON_LEGACY = /from products\b[\s\S]*order by position/;

const RESPUESTAS_IGUALES = [
  { patron: PATRON_LEGACY, filas: [{ ...FILA }] as Record<string, unknown>[] },
  { patron: /from product_private_data/,
    filas: [{ product_id: "apl-001", ...RELACIONAL.privados }] },
  { patron: /from product_categories/, filas: [
      { product_id: "apl-001", category_id: "7", parent_id: "1",
        slug: "placas-accesorios-placas-apagadores", nombre: "Placas y apagadores",
        principal: true },
    ] },
  { patron: /from product_images/, filas: [
      { product_id: "apl-001", id: "1", url: "/catalogos/electrico/apl-001.png",
        alt: "Módulo eléctrico apagador", posicion: 0, visible: true, principal: true },
      { product_id: "apl-001", id: "2", url: "/catalogos/electrico/apl-001-b.png",
        alt: "Módulo eléctrico apagador", posicion: 10, visible: true, principal: false },
    ] },
  { patron: /from product_attribute_values/, filas: [
      { product_id: "apl-001", id: "9", attribute_id: "3", clave: "amperage",
        nombre: "Amperaje", tipo: "numero", unidad: "A", filterable: true, comparable: true,
        active: true, value_number: 15, value_text: null, value_bool: null,
        option_id: null, option_clave: null, option_etiqueta: null },
    ] },
  { patron: /from product_prices/, filas: [
      { product_id: "apl-001", id: "5", centavos: "12500", tipo: "normal",
        desde: null, hasta: null },
    ] },
];

test("la comparación emite una lectura legacy y exactamente seis relacionales", async () => {
  const { ejecutar, sentencias } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(sentencias.length, 7, `emitió ${sentencias.length} consultas`);
});

test("la comparación no escribe nunca en la base", async () => {
  const { ejecutar, sentencias } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  for (const sentencia of sentencias) {
    assert.match(sentencia.trim().toLowerCase(), /^select\b/, `no es una lectura: ${sentencia}`);
  }
});

test("catálogos equivalentes registran cero diferencias, duración y correlación", async () => {
  const { ejecutar } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(resumen?.totalDiferencias, 0);
  const cierre = lineas.find((l) => l.suceso === "catalogo-shadow-resumen");
  assert.ok(cierre, "falta el resumen");
  assert.equal(cierre?.datos.diferencias, 0);
  assert.equal(typeof cierre?.datos.duracionMs, "number");
  assert.equal(typeof cierre?.datos.correlacion, "string");
  assert.equal(cierre?.datos.consultasRelacionales, 6);
});

test("un fallo de la lectura relacional se registra saneado y devuelve null", async () => {
  const ejecutar: Ejecutor = async (texto) => {
    if (PATRON_LEGACY.test(texto)) return [{ ...FILA }] as Record<string, unknown>[];
    throw new Error("connection to ep-secreto.neon.tech failed: password=supersecreto");
  };
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(resumen, null);
  const fallo = lineas.find((l) => l.suceso === "catalogo-shadow-error");
  assert.ok(fallo, "falta el registro del fallo");
  assert.equal(fallo?.nivel, "error");
  const serializado = JSON.stringify(lineas);
  assert.equal(serializado.includes("supersecreto"), false);
  assert.equal(serializado.includes("ep-secreto"), false);
});

test("los eventos de diferencia están limitados por comparación", async () => {
  const muchas = Array.from({ length: 200 }, (_, i) => ({
    ...FILA, id: `p-${i}`,
    econoluz_reference: `ECO-ELE-${String(i).padStart(4, "0")}`, position: i,
  })) as unknown as Record<string, unknown>[];
  const { ejecutar } = ejecutorFalso([{ patron: PATRON_LEGACY, filas: muchas }]);
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  const eventos = lineas.filter((l) => l.suceso === "catalogo-shadow-diferencia");
  assert.equal(eventos.length <= 25, true, `registró ${eventos.length} eventos`);
  assert.equal((resumen?.omitidas ?? 0) > 0, true);
});
```

- [ ] **Paso 2: verlas fallar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

Esperado: FALLA con «ejecutarComparacion is not a function».

- [ ] **Paso 3: implementar `ejecutarComparacion` en `comparacion.ts`**

```ts
import { randomBytes } from "node:crypto";

import type { Ejecutor } from "../../lib/datos/consulta";
import { leerCatalogoRelacional } from "./lectura";

/**
 * La lectura del catálogo antiguo **para comparar**, que no es la que sirve al visitante.
 *
 * Son dos consultas distintas a propósito: la del visitante
 * (`app/data/catalog.server.ts`) no se toca ni un carácter, porque el compromiso de esta
 * fase es que reciba exactamente lo de siempre. Esta otra pide además `published` y
 * `price_gtq` de **todos** los productos, publicados o no, porque el estado de publicación
 * es una de las dimensiones que hay que comparar.
 */
export const CONSULTA_LEGACY_COMPLETA =
  "select id, econoluz_reference, position, public_name, public_description, image, " +
  "images, technical_specs, product_type, product_type_label, application, " +
  "application_label, finish, finish_label, family_label, supplier_brand, " +
  "supplier_brand_label, supplier_series, supplier_series_label, supplier_code, " +
  "supplier_name, supplier_description, price_gtq, published " +
  "from products order by position, id";

export type Registro = (
  nivel: "info" | "error",
  suceso: string,
  datos?: Record<string, string | number | boolean>,
) => void;

/** Las seis consultas globales de `leerCatalogoRelacional`; no puede volver el N+1. */
const CONSULTAS_RELACIONALES_ESPERADAS = 6;

function normalizarFila(fila: Record<string, unknown>): FilaDeCatalogo {
  return {
    id: String(fila.id),
    econoluz_reference: String(fila.econoluz_reference),
    position: Number(fila.position),
    public_name: String(fila.public_name),
    public_description: String(fila.public_description),
    image: String(fila.image),
    images: Array.isArray(fila.images) ? fila.images.map(String) : null,
    technical_specs: (fila.technical_specs ?? null) as FilaDeCatalogo["technical_specs"],
    product_type: String(fila.product_type),
    product_type_label: String(fila.product_type_label),
    application: String(fila.application),
    application_label: String(fila.application_label),
    finish: String(fila.finish),
    finish_label: String(fila.finish_label),
    family_label: String(fila.family_label),
    supplier_brand: String(fila.supplier_brand ?? ""),
    supplier_brand_label: String(fila.supplier_brand_label ?? ""),
    supplier_series: String(fila.supplier_series ?? ""),
    supplier_series_label: String(fila.supplier_series_label ?? ""),
    supplier_code: String(fila.supplier_code ?? ""),
    supplier_name: String(fila.supplier_name ?? ""),
    supplier_description: String(fila.supplier_description ?? ""),
    price_gtq:
      fila.price_gtq === null || fila.price_gtq === undefined ? null : Number(fila.price_gtq),
    published: Boolean(fila.published),
  };
}

/**
 * Lee los dos catálogos, los compara y registra el resultado.
 *
 * **Nunca lanza.** Devuelve `null` si algo falló, y quien llama sigue sirviendo `legacy`.
 * Del error solo se registra su clase: el texto de Postgres puede llevar el host, el rol o
 * la contraseña, y esos no entran en un registro.
 */
export async function ejecutarComparacion(
  ejecutar: Ejecutor,
  registro: Registro,
  ahora: Date = new Date(),
): Promise<ResumenDeComparacion | null> {
  const correlacion = randomBytes(6).toString("hex");
  const arranque = Date.now();

  try {
    const filas = (await ejecutar(CONSULTA_LEGACY_COMPLETA, [])) as Record<string, unknown>[];
    const legacy = catalogoCanonicoDesdeLegacy(filas.map(normalizarFila));
    const relacional = catalogoCanonicoDesdeRelacional(
      await leerCatalogoRelacional(ejecutar),
      ahora,
    );

    const resumen = compararCatalogos(legacy, relacional);

    for (const diferencia of resumen.diferencias) {
      registro("info", "catalogo-shadow-diferencia", {
        correlacion,
        tipo: diferencia.tipo,
        producto: diferencia.producto ?? "",
        campo: diferencia.campo,
        huellaLegacy: diferencia.huellaLegacy ?? "",
        huellaRelacional: diferencia.huellaRelacional ?? "",
      });
    }

    registro(resumen.totalDiferencias === 0 ? "info" : "error", "catalogo-shadow-resumen", {
      correlacion,
      productosLegacy: resumen.productosLegacy,
      productosRelacional: resumen.productosRelacional,
      comparados: resumen.comparados,
      diferencias: resumen.totalDiferencias,
      omitidas: resumen.omitidas,
      consultasRelacionales: CONSULTAS_RELACIONALES_ESPERADAS,
      duracionMs: Date.now() - arranque,
    });

    return resumen;
  } catch (error) {
    registro("error", "catalogo-shadow-error", {
      correlacion,
      causa: error instanceof Error ? error.constructor.name : "desconocida",
      duracionMs: Date.now() - arranque,
    });
    return null;
  }
}
```

- [ ] **Paso 4: verlas pasar**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-comparacion.test.ts
```

- [ ] **Paso 5: crear `comparacion.server.ts`**

```ts
import "server-only";

import { leer, registrar, type Ejecutor } from "../../lib/datos";
import { ejecutarComparacion } from "./comparacion";

const ejecutarPrivado: Ejecutor = (texto, parametros = []) =>
  leer<Record<string, unknown>>(texto, parametros);

/**
 * La comparación de `shadow` contra la base real.
 *
 * Usa la conexión de la aplicación, la misma que ya lee el catálogo hoy: el rol público
 * tiene denegadas las ocho tablas nuevas, y esta comparación es trabajo interno que no
 * sirve a ningún visitante.
 */
export async function compararCatalogoEnSombra(): Promise<void> {
  await ejecutarComparacion(ejecutarPrivado, registrar);
}
```

- [ ] **Paso 6: enganchar `catalog.server.ts`**

**Sin tocar `readCatalogFromDatabase` ni `getCachedCatalog`.** Añadir los tres imports y
cambiar únicamente el cuerpo del `try` de `getPublicCatalog`:

```ts
import { obtenerModeloDeCatalogo } from "../lib/ajustes.server";
import { compararCatalogoEnSombra } from "./catalogo/comparacion.server";
import { servirSegunModelo } from "./catalogo/seleccion";

// …dentro de getPublicCatalog:
  try {
    // El modelo decide qué camino se sirve. En `legacy` y en `shadow` el visitante recibe
    // exactamente `getCachedCatalog()`, la lectura de siempre. `shadow` solo añade,
    // cuando la respuesta ya está decidida, una lectura del modelo nuevo y su
    // comparación, que no puede alterar ni romper lo que se devuelve.
    return await servirSegunModelo(await obtenerModeloDeCatalogo(), {
      legacy: getCachedCatalog,
      // El camino relacional pertenece a la Fase D y hoy es inalcanzable: la llave
      // `FASE_D_AUTORIZADA` está cerrada y `relational_v2` degrada a `shadow`.
      relacional: async () => {
        throw new Error("la Fase D no está autorizada");
      },
      comparar: compararCatalogoEnSombra,
    });
  } catch (error) {
```

- [ ] **Paso 7: comprobar tipos, estilo y compilación**

```bash
npm run typecheck && npm run lint && npm run build
```

- [ ] **Paso 8: commit**

```bash
git add app/data/catalogo/comparacion.ts app/data/catalogo/comparacion.server.ts app/data/catalog.server.ts tests/catalogo-comparacion.test.ts
git commit -m "feat(catalogo): comparacion en sombra sin cambiar la respuesta legacy"
```

---

## Tarea 5 — Los centinelas privados

**Archivos:**
- Crear: `tests/catalogo-shadow-privacidad.test.ts`
- Modificar: `package.json`

Esta prueba demuestra la regla que más caro sale romper: mete códigos inventados en
**todos** los campos privados, ejecuta la comparación completa y serializa resultado,
errores y registros enteros buscándolos.

- [ ] **Paso 1: escribir la prueba**

```ts
// tests/catalogo-shadow-privacidad.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicoDesdeLegacy,
  catalogoCanonicoDesdeLegacy,
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  ejecutarComparacion,
} from "../app/data/catalogo/comparacion";
import type { FilaDeCatalogo } from "../app/data/catalogo/importacion";
import type { Ejecutor } from "../app/lib/datos/consulta";

/** Cadenas imposibles de encontrar por casualidad, una por campo privado. */
const CENTINELAS = {
  supplier_brand: "CENTINELA-MARCA-9F2A",
  supplier_brand_label: "CENTINELA-ETIQUETA-MARCA-9F2B",
  supplier_series: "CENTINELA-SERIE-9F2C",
  supplier_series_label: "CENTINELA-ETIQUETA-SERIE-9F2D",
  supplier_code: "CENTINELA-CODIGO-9F2E",
  supplier_name: "CENTINELA-NOMBRE-PROVEEDOR-9F2F",
  supplier_description: "CENTINELA-DESCRIPCION-PROVEEDOR-9F30",
};

const FILA: FilaDeCatalogo = {
  id: "cen-001",
  econoluz_reference: "ECO-CEN-0001",
  position: 10,
  public_name: "Luminaria de prueba",
  public_description: "Descripción pública inofensiva.",
  image: "/catalogos/prueba/cen-001.png",
  images: null,
  technical_specs: { amperage: "10 A" },
  product_type: "iluminacion",
  product_type_label: "Iluminación",
  application: "interior",
  application_label: "Interior",
  finish: "blanco",
  finish_label: "Blanco",
  family_label: "Prueba",
  ...CENTINELAS,
  price_gtq: 100,
  published: true,
};

const todos = Object.values(CENTINELAS);

function sinCentinelas(texto: string, donde: string) {
  for (const centinela of todos) {
    assert.equal(texto.includes(centinela), false, `${donde} contiene ${centinela}`);
  }
}

test("el canónico y las diferencias nunca contienen un centinela privado", () => {
  const legacy = catalogoCanonicoDesdeLegacy([FILA]);
  sinCentinelas(JSON.stringify(legacy), "el canónico legacy");

  // Un relacional vacío fuerza diferencias reales, para comprobar que tampoco las llevan.
  const resumen = compararCatalogos(legacy, catalogoCanonicoDesdeRelacional([], new Date()));
  sinCentinelas(JSON.stringify(resumen), "el resumen de diferencias");
  assert.equal(resumen.totalDiferencias > 0, true, "la prueba necesita diferencias reales");
});

test("ni el resultado, ni los registros, ni los errores llevan datos privados", async () => {
  const lineas: unknown[] = [];
  const registro = (nivel: "info" | "error", suceso: string, datos = {}) => {
    lineas.push({ nivel, suceso, datos });
  };

  const ejecutar: Ejecutor = async (texto) => {
    if (/from products\b[\s\S]*order by position/.test(texto)) {
      return [{ ...FILA }] as Record<string, unknown>[];
    }
    // Un fallo cuyo mensaje arrastra un centinela y una credencial: ninguno de los dos
    // puede aparecer en ninguna parte.
    throw new Error(
      `fallo leyendo ${CENTINELAS.supplier_code} en postgresql://usuario:clave-secreta@host/db`,
    );
  };

  const resumen = await ejecutarComparacion(ejecutar, registro, new Date());

  const todoJunto = JSON.stringify({ resumen, lineas });
  sinCentinelas(todoJunto, "la salida completa");
  assert.equal(todoJunto.includes("clave-secreta"), false, "se filtró una credencial");
  assert.equal(todoJunto.includes("postgresql://"), false, "se filtró una cadena de conexión");
  assert.equal(lineas.length > 0, true, "el fallo tiene que quedar registrado");
});

test("cambiar solo los campos privados no cambia el canónico público", () => {
  const otro: FilaDeCatalogo = {
    ...FILA,
    supplier_brand: "otra",
    supplier_brand_label: "Otra",
    supplier_series: "otra_serie",
    supplier_series_label: "Otra serie",
    supplier_code: "OTRO-CODIGO",
    supplier_name: "Otro nombre de proveedor",
    supplier_description: "Otra descripción de proveedor",
  };
  assert.deepEqual(canonicoDesdeLegacy(otro), canonicoDesdeLegacy(FILA));
});
```

- [ ] **Paso 2: ejecutarla y después romper la protección a propósito**

```bash
npm exec -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-shadow-privacidad.test.ts
```

Después, en `ejecutarComparacion`, cambiar
`causa: error instanceof Error ? error.constructor.name : "desconocida"` por
`causa: error instanceof Error ? error.message : "desconocida"`, volver a ejecutar y
**ver la prueba en rojo** señalando la credencial. Deshacer la rotura y verla en verde.

- [ ] **Paso 3: añadir las tres pruebas nuevas a `test:datos`**

En `package.json`, al final de la lista de `test:datos`, tras
`tests/catalogo-idempotencia.test.ts`:

```
tests/catalogo-comparacion.test.ts tests/catalogo-seleccion.test.ts tests/catalogo-shadow-privacidad.test.ts
```

- [ ] **Paso 4: batería completa**

```bash
npm run test:datos
```

- [ ] **Paso 5: commit**

```bash
git add tests/catalogo-shadow-privacidad.test.ts package.json
git commit -m "test(catalogo): centinelas privados en resultados, errores y registros"
```

---

## Tarea 6 — Los dos comandos contra Neon

**Archivos:**
- Crear: `scripts/comparar-catalogo-shadow.mjs`
- Crear: `scripts/modelo-catalogo.mjs`
- Modificar: `package.json`

Ambos exigen `exigirRamaDeDesarrollo`, que ya rechaza cualquier endpoint que no sea el
esperado y rechaza explícitamente el de Producción.

- [ ] **Paso 1: escribir `scripts/comparar-catalogo-shadow.mjs`**

```js
// Comparación completa del catálogo antiguo contra el relacional en la rama aislada.
//
// Se ejecuta dentro de una transacción de solo lectura y termina siempre en ROLLBACK: esta
// comparación no puede modificar nada, ni siquiera por accidente.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import {
  catalogoCanonicoDesdeLegacy,
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  CONSULTA_LEGACY_COMPLETA,
} from "../app/data/catalogo/comparacion.ts";
import { leerCatalogoRelacional } from "../app/data/catalogo/lectura.ts";
import { exigirRamaDeDesarrollo } from "./guarda-neon.mjs";

/** Las filas llegan de Postgres con `numeric` en texto y `jsonb` ya expandido. */
function normalizar(fila) {
  return {
    ...fila,
    id: String(fila.id),
    position: Number(fila.position),
    images: Array.isArray(fila.images) ? fila.images.map(String) : null,
    technical_specs: fila.technical_specs ?? null,
    price_gtq: fila.price_gtq === null ? null : Number(fila.price_gtq),
    published: Boolean(fila.published),
  };
}

export async function compararEnSombra(cliente, entorno = process.env) {
  await exigirRamaDeDesarrollo(cliente, entorno);

  const sentencias = [];
  const ejecutar = async (sql, parametros = []) => {
    sentencias.push(sql);
    return (await cliente.query(sql, parametros)).rows;
  };

  const arranque = Date.now();
  const filas = await ejecutar(CONSULTA_LEGACY_COMPLETA);
  const consultasLegacy = sentencias.length;

  const ahora = new Date();
  const relacional = await leerCatalogoRelacional(ejecutar);
  const consultasRelacionales = sentencias.length - consultasLegacy;

  const resumen = compararCatalogos(
    catalogoCanonicoDesdeLegacy(filas.map(normalizar)),
    catalogoCanonicoDesdeRelacional(relacional, ahora),
    Number(entorno.SHADOW_LIMITE ?? 50),
  );

  const escrituras = sentencias.filter((sql) => !/^\s*select\b/i.test(sql));

  return {
    ok: resumen.totalDiferencias === 0 && escrituras.length === 0,
    ...resumen,
    consultasLegacy,
    consultasRelacionales,
    escrituras: escrituras.length,
    duracionMs: Date.now() - arranque,
  };
}

async function ejecutarDesdeTerminal() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    await cliente.query("begin transaction isolation level repeatable read read only");
    const resultado = await compararEnSombra(cliente);
    await cliente.query("rollback");
    console.log(JSON.stringify(resultado, null, 2));
    if (!resultado.ok) process.exitCode = 1;
  } catch (error) {
    await cliente.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarDesdeTerminal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Paso 2: escribir `scripts/modelo-catalogo.mjs`**

```js
// Lee o cambia `modelo_catalogo`, siempre dentro de la rama aislada de desarrollo.
//
// `relational_v2` no se acepta aquí: activarlo es la Fase D y necesita otra autorización.

import { fileURLToPath } from "node:url";

import { Client, neonConfig } from "@neondatabase/serverless";

import { exigirRamaDeDesarrollo } from "./guarda-neon.mjs";

const PERMITIDOS = new Set(["legacy", "shadow"]);

export async function leerModelo(cliente) {
  const { rows } = await cliente.query(
    "select valor from app_settings where clave = 'modelo_catalogo'",
  );
  return rows[0]?.valor ?? null;
}

export async function ponerModelo(cliente, valor, entorno = process.env) {
  if (!PERMITIDOS.has(valor)) {
    throw new Error(`Valor no permitido en esta fase: ${valor}. Solo legacy o shadow.`);
  }
  await exigirRamaDeDesarrollo(cliente, entorno);
  await cliente.query("begin");
  try {
    await cliente.query(
      `update app_settings set valor = $1, actualizado_por = 'catalogo-relacional-fase-c'
        where clave = 'modelo_catalogo'`,
      [valor],
    );
    await cliente.query("commit");
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
  return leerModelo(cliente);
}

async function ejecutarDesdeTerminal() {
  const [accion, valor] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const cliente = new Client(process.env.DATABASE_URL);
  await cliente.connect();
  try {
    if (accion === "--poner") {
      console.log(`modelo_catalogo = ${await ponerModelo(cliente, valor)}`);
    } else {
      await exigirRamaDeDesarrollo(cliente);
      console.log(`modelo_catalogo = ${await leerModelo(cliente)}`);
    }
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutarDesdeTerminal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Paso 3: añadir los comandos a `package.json`**

Junto a los demás `catalogo:relacional:*`:

```json
"catalogo:relacional:comparar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs ./scripts/comparar-catalogo-shadow.mjs",
"catalogo:relacional:modelo": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs ./scripts/modelo-catalogo.mjs",
```

- [ ] **Paso 4: comprobar que el guardián corta**

Con `NEON_ENDPOINT_ESPERADO` deliberadamente equivocado, el comando debe negarse:

```bash
NEON_ENDPOINT_ESPERADO="ep-inventado.neon.tech" npm run catalogo:relacional:modelo
```

Esperado: «El endpoint conectado no es el esperado» y código de salida 1.

- [ ] **Paso 5: commit**

```bash
git add scripts/comparar-catalogo-shadow.mjs scripts/modelo-catalogo.mjs package.json
git commit -m "feat(catalogo): comandos de comparacion en sombra y de bandera del modelo"
```

---

## Tarea 7 — Paridad real contra la rama de desarrollo

Sin archivos nuevos: es trabajo de integración, y su resultado se documenta en la tarea 9.
Las credenciales van en variables temporales del shell y **no se escriben en ningún
archivo**. El worktree no tiene `.env.local` y no debe crearse.

- [ ] **Paso 1: preparar el entorno de la sesión**

```bash
export NEON_PROYECTO=dry-firefly-38616588
export NEON_RAMA_ESPERADA=catalogo-relacional-fase-b
export NEON_ENDPOINT_ESPERADO=ep-green-union-avi3x99e.c-11.us-east-1.aws.neon.tech
export NEON_ENDPOINT_PRODUCCION=ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech
export DATABASE_URL="$(npx --no-install neonctl connection-string br-quiet-hat-avozt905 --project-id $NEON_PROYECTO --role-name neondb_owner --database-name neondb | tr -d '\r' | tail -1)"
```

- [ ] **Paso 2: confirmar el punto de partida**

```bash
npm run catalogo:relacional:modelo
```

Esperado: `modelo_catalogo = legacy`.

- [ ] **Paso 3: comparación completa antes de tocar la bandera**

```bash
npm run catalogo:relacional:comparar
```

Anotar `productosLegacy`, `productosRelacional`, `comparados`, `totalDiferencias`,
`porTipo`, `porCampo`, `consultasRelacionales` (tiene que ser **6**), `escrituras` (tiene
que ser **0**) y `duracionMs`.

- [ ] **Paso 4: investigar cada diferencia**

Para cada entrada de `porCampo`, averiguar la causa leyendo el producto concreto por su
identificador público. **No se inventan precios, atributos ni contenido, y no se borran
datos para forzar igualdad.** Si la corrección es inequívoca —una traducción mal hecha—,
se arregla con TDD: primero la prueba que reproduce la diferencia en
`tests/catalogo-comparacion.test.ts`, después el código, después volver al paso 3. Si hace
falta reimportar, `npm run catalogo:relacional:importar`, que es idempotente y
transaccional, y repetir los conteos. **Si la causa exige una decisión de negocio, parar y
preguntar al dueño.**

- [ ] **Paso 5: poner la bandera en `shadow`, solo en Desarrollo**

```bash
npm run catalogo:relacional:modelo -- --poner shadow
```

Esperado: `modelo_catalogo = shadow`.

- [ ] **Paso 6: repetir la comparación y el verificador de la Fase B**

El verificador de la Fase B exige `modelo_catalogo === "legacy"`; ahora vale `shadow`, así
que hay que actualizar esa comprobación para que acepte los dos y siga rechazando
`relational_v2`:

```js
  agregarFallo(
    fallos,
    modelo === "legacy" || modelo === "shadow",
    `modelo_catalogo vale ${String(modelo)}`,
  );
```

```bash
npm run catalogo:relacional:comparar && npm run catalogo:relacional:verificar
```

Ambos deben terminar con `ok: true`.

- [ ] **Paso 7: commit**

```bash
git add scripts/verificar-catalogo-relacional.mjs
git commit -m "fix(catalogo): el verificador acepta shadow y sigue rechazando relational_v2"
```

---

## Tarea 8 — Preview temporal de Vercel

- [ ] **Paso 1: crear el Preview apuntando a Desarrollo**

Nunca `--prod`. La cadena viaja como variable de **este** despliegue; no se toca ninguna
variable compartida de Production:

```bash
npx --no-install vercel deploy --archive=tgz --env DATABASE_URL="$DATABASE_URL"
```

Si la CLI no permite fijar la variable solo para este despliegue sin modificar las del
proyecto, **parar y preguntar al dueño**. `DATABASE_URL` de Production no se toca bajo
ningún concepto. Deployment Protection está desactivada: no se añade ninguna ruta de
diagnóstico ni información privada accesible públicamente.

- [ ] **Paso 2: comprobar las páginas públicas reales**

Abrir `/catalogo`, una ficha con precio y `/carrito` en la URL del Preview y confirmar que
enseñan lo mismo que hoy: el resultado `legacy`.

- [ ] **Paso 3: leer los registros del servidor**

```bash
npx --no-install vercel logs <url-del-preview>
```

Buscar `catalogo-shadow-resumen` y comprobar `diferencias: 0`, `consultasRelacionales: 6`
y una `duracionMs` razonable. Comprobar que **no aparece** ningún código de proveedor,
nombre de proveedor ni cadena de conexión.

- [ ] **Paso 4: Playwright o comprobaciones equivalentes contra el Preview**

```bash
PLAYWRIGHT_BASE_URL=<url-del-preview> npm exec -- playwright test
```

Si `playwright.config.ts` no admite una base externa, hacer las comprobaciones
equivalentes sobre las tres páginas y decirlo así en el informe.

- [ ] **Paso 5: borrar el Preview**

Anotar la URL antes de borrarla. **La rama de Neon no se borra.**

```bash
npx --no-install vercel remove <nombre-del-despliegue> --yes
```

---

## Tarea 9 — Verificación completa, documentación y cierre

- [ ] **Paso 1: baterías completas**

```bash
npm run test:datos && npm run test:admin && npm run test:proveedores && npm run test:permisos && npm run typecheck && npm run lint && npm run build
```

- [ ] **Paso 2: Playwright local**

```bash
npm exec -- playwright test
```

Leer el informe antes de repetir nada. Los fallos que ya existían por arrancar sin
`DATABASE_URL` se identifican como tales y **no se ocultan**.

- [ ] **Paso 3: documentación operativa**

Actualizar `docs/CONTINUAR-PANEL.md` con una sección «Subproyecto 3: Fase C» que recoja
rama y endpoint usados (sin credenciales), el estado final de `modelo_catalogo` en
Desarrollo, la confirmación de que Producción sigue en `legacy`, productos comparados,
diferencias iniciales, correcciones y diferencias finales, consultas, duración, la URL del
Preview y su borrado, y las baterías con sus cifras exactas. Actualizar `CLAUDE.md` §0 con
el estado del subproyecto 3 y con la existencia de la llave `FASE_D_AUTORIZADA`.

- [ ] **Paso 4: dejar el árbol limpio**

```bash
git status --porcelain
```

- [ ] **Paso 5: commit final**

```bash
git add docs/CONTINUAR-PANEL.md CLAUDE.md docs/superpowers/plans/2026-09-02-catalogo-relacional-fase-c.md
git commit -m "docs(catalogo): registrar la verificacion de la fase c"
```

---

## Criterios de aceptación

1. `legacy` no emite ni una consulta relacional.
2. `shadow` ejecuta ambos lectores y devuelve exactamente `legacy`.
3. Dos catálogos equivalentes dan cero diferencias.
4. Producto ausente, adicional y campo distinto se detectan.
5. El orden de llegada de las colecciones no genera falsos positivos.
6. Un orden de catálogo realmente distinto sí se detecta.
7. Un fallo relacional deja intacta la respuesta `legacy`.
8. Ningún resultado, error ni registro contiene datos privados, y la prueba se ha visto
   fallar rompiendo la protección a propósito.
9. La lectura relacional sigue emitiendo seis consultas para 313 productos.
10. `relational_v2` no se activa con ningún valor que no sea exactamente ese, y aun con él
    la llave de la Fase D sigue sirviendo `legacy`.
11. La comparación no escribe: todas sus sentencias empiezan por `select`.
12. Los eventos por comparación están limitados y el resto se cuenta como `omitidas`.
13. Paridad demostrada contra la rama aislada, con `modelo_catalogo = shadow` solo allí.
14. Producción intacta: sin escrituras, sin despliegue, `modelo_catalogo` en `legacy`.
