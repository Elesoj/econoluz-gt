# Catálogo relacional v2 — plan de implementación (subproyecto 3)

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Objetivo:** que el catálogo deje de vivir en 28 columnas y un JSON, y pase a nueve tablas
relacionales que permitan filtrar por rango («entre 15 y 25 W»), tener varias categorías por
producto, precios con vigencia y promociones que la base impide solapar.

**Arquitectura:** el modelo nuevo se construye **al lado** del viejo, sin sustituirlo. La
bandera `modelo_catalogo` de `app_settings` decide qué se sirve, con tres valores:
`legacy` (hoy), `shadow` (se lee de los dos y se comparan las diferencias sin cambiar lo
que ve el visitante) y `relational_v2`. **`relational_v2` solo se activa con autorización
expresa del dueño**, con paridad y privacidad en verde.

**Stack:** el del proyecto. Postgres 18 en Neon, `app/lib/datos` como única puerta, pruebas
con `node:test`.

**Diseño:** `docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md`, §5.3 el
modelo y §9.4 la transición.

## Restricciones globales

- **Rama `feat/catalogo-relacional`, worktree `.worktrees/catalogo-relacional`.**
- **`modelo_catalogo` no se toca.** Sigue en `legacy` y cambiarla necesita autorización
  expresa. Que las piezas estén probadas **no es autorización**.
- **La fuente del catálogo público no cambia** hasta la fase C, y su activación hasta la D.
- **Ninguna migración destructiva.** El modelo viejo se conserva entero; retirarlo es el
  subproyecto 11.
- **No se escribe en la Neon de producción**, ni se aplica ninguna migración allí.
- **`stock` no reaparece bajo ninguna forma** (`CLAUDE.md` §0.2).
- **El catálogo público no expone datos del proveedor.** Las siete columnas `supplier_*`
  se mudan a `product_private_data`, que **nunca** sale al visitante, y
  `test:proveedores` y la prueba de *chunks* siguen vigilándolo.
- Español de España en comentarios, commits y resúmenes. Sin push, sin fusión, sin despliegue.

---

## Fases, y qué autorización necesita cada una

| Fase | Qué hace | ¿Ejecutable sin pedir permiso? |
|---|---|---|
| **A. Esquema y piezas puras** | El archivo de migración y toda la lógica que no toca la base: tipado de atributos, resolución del precio vigente, árbol de categorías, traducción producto ↔ filas | **Sí.** Escribir el `.sql` no es aplicarlo |
| **B. Escritura y lectura del modelo nuevo** | Aplicar la migración en una rama de Neon de desarrollo, importar los 313 productos, leer del modelo nuevo | **No.** Aplicar migraciones necesita autorización |
| **C. Sombra y paridad** | Leer de los dos modelos, comparar y registrar diferencias sin cambiar lo que ve el visitante | **No.** Necesita B, y cambiar la bandera a `shadow` |
| **D. Activación** | `modelo_catalogo = relational_v2` | **No.** Autorización expresa, con paridad y privacidad en verde |

Este plan detalla la **fase A** paso a paso. Las fases B a D quedan listadas al final con
su alcance, para redactarlas cuando la anterior esté aprobada.

---

## Estructura de archivos de la fase A

| Archivo | Responsabilidad |
|---|---|
| `db/010_catalogo_relacional.sql` — **nuevo, sin aplicar** | Las nueve tablas, sus restricciones e índices |
| `app/data/catalogo/atributos.ts` — **nuevo** | Los cinco tipos de atributo y qué columna corresponde a cada uno; validación |
| `app/data/catalogo/precios.ts` — **nuevo** | Resolución del precio vigente y detección de promociones solapadas |
| `app/data/catalogo/categorias.ts` — **nuevo** | Árbol de categorías: rutas, principal única, ciclos |
| `tests/catalogo-atributos.test.ts` · `catalogo-precios.test.ts` · `catalogo-categorias.test.ts` | Sus pruebas |

Todo puro: sin red, sin base de datos y sin `server-only`, para poder probarlo entero.

---

## Tarea A1: El tipado de atributos

Es la pieza que da sentido al subproyecto: `product_attribute_values` guarda cuatro
columnas —`value_number`, `value_text`, `value_bool`, `option_id`— y **exactamente una**
debe estar llena según el tipo declarado del atributo. Sin esa regla, «20 W» vuelve a ser
una cadena y el filtro por rango es imposible.

**Archivos:** crear `app/data/catalogo/atributos.ts` y `tests/catalogo-atributos.test.ts`.

**Produce:**
- `type TipoDeAtributo = "numero" | "texto" | "booleano" | "opcion" | "opcion_multiple"`
- `COLUMNA_DE_TIPO: Record<TipoDeAtributo, string>`
- `validarValor(tipo, valor): { ok: true; columnas } | { ok: false; motivo }`

Los pasos son los del ciclo de siempre: prueba que falla, mínima implementación, prueba que
pasa, rotura deliberada para ver fallar la prueba, commit.

## Tarea A2: El precio vigente

`product_prices` guarda centavos enteros, tipo (`normal`, `promocion`) y periodo de validez.
Resolver **qué precio se cobra hoy** es puro y es donde más fácil es equivocarse: una
promoción caducada no puede ganar, y dos promociones solapadas son un error de datos que la
base rechaza pero que la aplicación tiene que saber detectar antes de intentar escribirlo.

**Produce:**
- `precioVigente(precios, ahora): PrecioResuelto | null`
- `haySolape(promociones): boolean`

**Reglas que fijan las pruebas:** el dinero se compara en **centavos enteros**; una
promoción vigente gana al precio normal; una caducada o futura no cuenta; sin ningún precio
vigente el producto **no se vende** —«tener precio es estar a la venta», `CLAUDE.md` §2—.

## Tarea A3: El árbol de categorías

`categories` tiene `parent_id` hacia sí misma y `product_categories` permite pertenencia
múltiple con **una principal**. Lo puro que hay aquí: construir la ruta de una categoría,
detectar ciclos y comprobar que hay exactamente una principal.

**Produce:** `rutaDeCategoria`, `hayCiclo`, `validarPertenencias`.

## Tarea A4: La migración `010`, escrita y sin aplicar

Las nueve tablas del diseño §5.3, con:
- índice único parcial que garantiza **una sola categoría principal** por producto;
- restricción que obliga a llenar la columna que corresponde al tipo del atributo;
- **restricción de exclusión** que impide dos promociones solapadas del mismo producto
  (necesita `btree_gist`);
- índices por `(attribute_id, value_number)` y `(attribute_id, option_id)`.

**No se aplica.** La tarea termina con el archivo escrito, revisado y una prueba que
comprueba su forma, igual que hace `tests/datos-migrador.test.ts` con las anteriores.

## Tarea A5: Cerrar la fase

Batería completa y documentación al día. **La fase B no empieza sin autorización.**

---

## Fases B, C y D — alcance, para redactarlas cuando toque

**B.** Aplicar `010` en una rama de Neon de desarrollo; importador idempotente de los 313
productos al modelo nuevo, sembrando las 12 características normalizadas y `ambiente`;
lectura del modelo nuevo con su contrato público; ampliar `test:permisos` con las nueve
tablas.

**C.** Lectura en paralelo con `modelo_catalogo = shadow`: se sirve el modelo viejo y se
compara con el nuevo, registrando diferencias **sin cambiar lo que ve el visitante**.
Pruebas de paridad de los 313 productos y de privacidad del proveedor sobre el modelo nuevo.

**D.** `relational_v2`, con autorización expresa, paridad y privacidad en verde, y vuelta
atrás inmediata cambiando la bandera —que por eso vive en `app_settings` y no en una
variable de entorno—.

---

## Antes de ejecutar Playwright en este worktree

**Este worktree no tiene `.env.local`**, y sin él cinco pruebas de Playwright fallan sin
que haya ninguna regresión:

```
catalog-public-ui  › una selección de cotización vieja no rompe el catálogo
tienda-carrito     › comprar un producto con precio y encontrarlo al volver
tienda-carrito     › cambiar la cantidad recalcula el total
tienda-carrito     › el catálogo ya no ofrece cotizar producto a producto
tienda-carrito     › el inventario no viaja al navegador
```

El informe lo dice sin rodeos: *«ningún producto del catálogo tiene precio: ponle precio a
alguno desde el panel»*. Sin `DATABASE_URL` el catálogo se sirve del respaldo estático de
`app/data/products.ts`, donde no hay precios, así que no existe el botón «Agregar al
carrito» que esas cinco buscan.

**No es un fallo del subproyecto 3**, cuyo código es puro y no toca ninguna ruta: las
mismas 70 pruebas pasan en el worktree principal, que sí tiene `.env.local`. Para
ejecutarlas aquí hay que copiar ese archivo desde `frontend/`, y **eso lo decide el dueño**,
porque es su archivo de credenciales y duplicarlo en disco es su decisión, no la de quien
programa.

Las pruebas de unidad —`test:datos`, `test:admin`, `test:proveedores`— y `typecheck`,
`lint` y `build` **sí funcionan aquí sin `.env.local`**, y son las que cubren todo lo que
añade la fase A.
