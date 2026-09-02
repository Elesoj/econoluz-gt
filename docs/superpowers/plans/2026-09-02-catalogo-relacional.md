# Núcleo relacional de productos — plan de la Fase A (subproyecto 3)

> **Reescrito el 02/09/2026.** La versión anterior quedó **obsoleta**: se escribió antes de
> aprobarse `docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md` y
> contradice el diseño en tres puntos —proponía nueve tablas, incluía `category_attributes`
> y duplicaba el código del proveedor en tres columnas—. Este documento la sustituye entera.

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA:
> `superpowers:executing-plans` o `superpowers:subagent-driven-development`, y
> `superpowers:test-driven-development` en cada tarea.

**Objetivo de la Fase A:** dejar el esquema y la lógica pura del núcleo relacional
correctos y probados, **sin aplicar ninguna migración y sin tocar Neon**.

**Diseño:** `docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md`.

## Restricciones globales

- **Rama `feat/catalogo-relacional`, worktree `.worktrees/catalogo-relacional`.**
- **La Fase B no empieza aquí.** No se aplica ninguna migración, no se conecta a Neon, no se
  importa nada y `modelo_catalogo` no se toca: sigue en `legacy`.
- **Sin push, sin fusión, sin despliegue.**
- **No se borra ningún archivo** sin autorización. La corrección se hace reescribiendo.
- **Ocho tablas nuevas, ni una más.** `public_products` ya existe y es una proyección
  derivada, no una tabla de este subproyecto.
- **No hay relación entre categorías y atributos.** Una categoría clasifica; una
  característica describe al producto que la posee.
- Español de España en comentarios y mensajes de commit.

---

## Qué estaba mal en la Fase A ya implementada

| # | Defecto | Dónde |
|---|---|---|
| 1 | Existía `category_attributes`, que el diseño prohíbe expresamente | `db/010` |
| 2 | Nueve tablas en vez de ocho | `db/010` |
| 3 | `product_private_data` duplicaba el código del proveedor en `sku`, `product_code` y `supplier_code`, y le faltaban las dos etiquetas y la descripción | `db/010` |
| 4 | `supplier_code` no era buscable: sin índice | `db/010` |
| 5 | Solo se garantizaba **como mucho** una categoría principal, no **exactamente una** cuando hay categorías | `db/010` |
| 6 | `product_images` no impedía dos posiciones iguales ni declaraba imagen principal | `db/010` |
| 7 | Nada impedía cambiar el tipo de un atributo ya usado | `db/010` y lógica |
| 8 | Nada comprobaba que la opción elegida perteneciera al atributo | `db/010` y lógica |
| 9 | Nada impedía dos valores escalares del mismo atributo, ni la misma opción dos veces | `db/010` y lógica |
| 10 | `attributes` y `attribute_options` no tenían `active`, así que no se podía desactivar lo usado | `db/010` |
| 11 | La lógica pura no sabía borrar solo lo no usado ni desactivar lo usado | `atributos.ts` |
| 12 | No existía la lógica de categorías | — |

---

## Tarea 1: Las reglas de atributos y opciones, en lógica pura

**Archivos:** modificar `app/data/catalogo/atributos.ts` y `tests/catalogo-atributos.test.ts`.

Se conserva lo que ya existe —`TIPOS_DE_ATRIBUTO`, `COLUMNA_DE_TIPO`, `validarValor`,
`columnasLlenas`— y se añade:

- `decidirRetirada(usos)`: `"borrar"` si nunca se usó, `"desactivar"` en cuanto hay un uso.
  Vale igual para un atributo y para una opción.
- `puedeCambiarseElTipo(usos)`: falso en cuanto hay un uso, para no reinterpretar datos
  existentes.
- `validarAsignaciones(atributo, asignaciones)`: los escalares admiten **como mucho una**;
  `opcion_multiple` admite varias pero **nunca la misma opción dos veces**; la opción tiene
  que **pertenecer al atributo**; y una opción **inactiva** no admite asignaciones nuevas,
  aunque las históricas se conserven.

Ciclo por cada regla: prueba que falla, mínimo para pasarla, rotura deliberada.

## Tarea 2: Las reglas de categorías, en lógica pura

**Archivos:** crear `app/data/catalogo/categorias.ts` y `tests/catalogo-categorias.test.ts`.

- `validarPertenencias(pertenencias)`: **exactamente una principal cuando hay al menos una
  categoría**. Sin categorías es válido; ni cero principales ni dos.
- `hayCiclo(categorias)`: una categoría no puede colgar de sí misma, ni directa ni
  indirectamente.
- `rutaDeCategoria(categorias, id)`: la ruta desde la raíz, para migas y URLs.

## Tarea 3: La lectura de precios que pide el diseño

**Archivos:** modificar `app/data/catalogo/precios.ts` y sus pruebas.

El diseño §3.9 pide obtener **el precio normal vigente y, si existe, la única promoción
vigente**, no solo el resultante. `precioVigente` se conserva y se añade
`preciosVigentes(precios, ahora)`, que devuelve los dos por separado.

## Tarea 4: Reescribir la migración `010`

**Archivos:** reescribir `db/010_catalogo_relacional.sql` y `tests/catalogo-migracion.test.ts`.

**Ocho tablas.** `category_attributes` desaparece.

Lo que se resuelve **de forma declarativa**, para que no dependa de que la aplicación se
acuerde:

- `attributes` gana `unique (id, tipo)`, y `product_attribute_values` lleva una columna
  `attribute_type` con clave foránea compuesta `(attribute_id, attribute_type)` hacia
  `attributes (id, tipo)` **`on update restrict`**. Eso hace que **cambiar el tipo de un
  atributo usado lo rechace la base**, no un `if` que alguien pueda olvidar.
- `attribute_options` gana `unique (id, attribute_id)`, y los valores llevan clave foránea
  compuesta `(option_id, attribute_id)`: **la opción tiene que ser de ese atributo**.
- Índice único parcial `(product_id, attribute_id)` sobre las filas que no son
  `opcion_multiple`: **un solo valor escalar** por producto y atributo.
- `unique (product_id, attribute_id, option_id)`: **nunca la misma opción dos veces**.
- `product_categories` conserva el índice parcial de «como mucho una principal» y añade un
  **`constraint trigger` diferible** que exige **exactamente una** al cerrar la transacción,
  de modo que se puedan reemplazar las categorías de un producto sin estados intermedios
  inválidos.
- `product_images` gana `unique (product_id, posicion)` y un índice parcial que impide dos
  principales.
- `product_private_data` queda con **los siete campos del diseño y ni uno más**, con
  `supplier_code` **indexado para poder buscarlo** y **sin `unique`**, porque hay registros
  con varios códigos separados por barras.

Lo que **no** se puede expresar de forma declarativa y queda para el contrato de escritura
de la Fase B: que la opción tenga que estar **activa** solo para asignaciones nuevas, y que
un producto **publicado** tenga imagen principal visible. Las dos dependen de estado que
cambia con el tiempo.

**La migración sigue sin aplicarse.**

## Tarea 5: Documentación y batería

`CLAUDE.md` y `docs/CONTINUAR-PANEL.md` al día, y la batería completa. **La Fase B no
empieza sin autorización expresa.**

---

## Fases B, C y D

Sin cambios respecto al diseño §5: aplicar en una rama de Neon de desarrollo e importar de
forma idempotente (B), `shadow` hasta lograr paridad (C), y `relational_v2` con autorización
expresa y reversión inmediata a `legacy` (D). Cada una necesita su propia autorización.

---

## Antes de ejecutar Playwright en este worktree

**Este worktree no tiene `.env.local`**, y sin él cinco pruebas fallan sin que haya ninguna
regresión: el informe dice «ningún producto del catálogo tiene precio», porque sin
`DATABASE_URL` el catálogo se sirve del respaldo estático, que no tiene precios, y el botón
«Agregar al carrito» no existe. Las mismas 70 pasan en el worktree principal. Copiar ese
archivo es decisión del dueño.

Las pruebas de unidad, `typecheck`, `lint` y `build` **sí funcionan aquí sin `.env.local`**,
y son las que cubren todo lo que añade la Fase A.
