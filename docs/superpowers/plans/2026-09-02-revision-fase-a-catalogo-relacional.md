# Revisión de la Fase A del catálogo relacional — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar `superpowers:executing-plans` y
> `superpowers:test-driven-development` tarea por tarea.

**Objetivo:** Corregir los nueve hallazgos confirmados de la revisión de la Fase A sin
aplicar migraciones, conectar a Neon, importar datos ni cambiar `modelo_catalogo`.

**Arquitectura:** Las invariantes que PostgreSQL puede garantizar quedan en
`db/010_catalogo_relacional.sql`; las reglas que distinguen una asignación nueva de un
valor histórico permanecen en la lógica pura. Las pruebas estructurales vigilan el SQL,
pero no se presentan como ejecución real: la migración completa requiere PostgreSQL 18
efímero o una rama aislada autorizada en la Fase B.

**Stack:** PostgreSQL 18, TypeScript 5.9, `node:test`, npm y Playwright.

**Especificación:** `docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md`
y los nueve hallazgos de revisión recibidos el 02/09/2026.

## Restricciones globales

- Trabajar solo en `.worktrees/catalogo-relacional`, rama `feat/catalogo-relacional`,
  partiendo de `7b40e0e`.
- No empezar la Fase B: no conectar ni escribir en Neon, no importar productos y no
  cambiar `modelo_catalogo`.
- No hacer push, merge ni despliegue; no borrar archivos.
- Crear commits pequeños, con mensajes en español.
- Ante un fallo de Playwright, inspeccionar el informe antes de repetir la ejecución.

---

### Tarea 1: Intercambio atómico de posiciones de imágenes

**Archivos:** modificar `tests/catalogo-migracion.test.ts` y
`db/010_catalogo_relacional.sql`.

**Interfaz:** la restricción `product_images_posicion_unica` debe ser
`UNIQUE (product_id, posicion) DEFERRABLE INITIALLY DEFERRED`.

- [ ] Añadir una prueba que extraiga la restricción y exija las dos cláusulas de
  diferibilidad.
- [ ] Ejecutar `node --test --import ./scripts/register-ts.mjs tests/catalogo-migracion.test.ts`
  y observar que falla por la restricción inmediata actual.
- [ ] Nombrar la restricción y declararla diferible e inicialmente diferida.
- [ ] Repetir la prueba y confirmar que pasa.
- [ ] Crear el commit `fix(catalogo): diferir el orden unico de las imagenes`.

### Tarea 2: Categoría principal comprobada al confirmar

**Archivos:** modificar `tests/catalogo-migracion.test.ts` y
`db/010_catalogo_relacional.sql`.

**Interfaz:** `product_categories_principal_idx` es un índice parcial no único de
búsqueda; el `constraint trigger` inicialmente diferido es la única garantía de
exactamente una principal cuando existen pertenencias.

- [ ] Añadir pruebas estructurales que rechacen el índice único inmediato, exijan el
  índice no único y unan los casos puros de cero, una y más de una principal con el
  trigger diferido.
- [ ] Ejecutar la prueba enfocada y observar el fallo por `create unique index`.
- [ ] Sustituir el índice y ajustar comentarios y trigger para comprobar todos los
  productos afectados por una actualización.
- [ ] Repetir la prueba enfocada y confirmar que pasa.
- [ ] Crear el commit `fix(catalogo): diferir la categoria principal`.

### Tarea 3: Borrado protegido de imágenes

**Archivos:** modificar `tests/catalogo-migracion.test.ts` y
`db/010_catalogo_relacional.sql`.

**Interfaz:** la FK `product_images.product_id` usa `ON DELETE RESTRICT`, porque la
retirada es reversible, no existe borrado permanente desde el panel y una cascada
borraría la referencia de la base sin borrar el archivo externo.

- [ ] Añadir una prueba que exija `ON DELETE RESTRICT` en esa FK.
- [ ] Ejecutarla y observar el fallo por el `CASCADE` actual.
- [ ] Cambiar FK y comentario para que expresen el mismo comportamiento.
- [ ] Repetir la prueba y confirmar que pasa.
- [ ] Crear el commit `fix(catalogo): proteger las imagenes al borrar productos`.

### Tarea 4: Opciones desactivadas nuevas e históricas

**Archivos:** modificar `tests/catalogo-atributos.test.ts` y
`app/data/catalogo/atributos.ts`.

**Interfaz:** `validarAsignaciones(atributo, asignaciones, modo)` acepta
`modo = "asignacion_nueva" | "valor_existente"`; el valor por defecto es el modo seguro
`"asignacion_nueva"`.

- [ ] Añadir una prueba que conserve una opción desactivada en modo `valor_existente`,
  manteniendo la prueba que la rechaza como asignación nueva.
- [ ] Ejecutar la prueba enfocada y observar que el caso histórico falla.
- [ ] Introducir el tipo de modo y condicionar únicamente la comprobación de `active`.
- [ ] Repetir la prueba y confirmar que ambos casos pasan.
- [ ] Crear el commit `fix(catalogo): conservar opciones desactivadas existentes`.

### Tarea 5: Guardianes de migraciones y `sku`

**Archivo:** modificar `tests/catalogo-migracion.test.ts`.

**Interfaz:** la secuencia se deriva de los nombres reales `NNN_*.sql`, empieza en 001,
no tiene huecos e incluye 010; añadir 011 no modifica ninguna lista esperada. El guardián
de `sku` usa límites de identificador SQL y no confunde `supplier_sku` con una columna
`sku`.

- [ ] Reescribir la prueba de secuencia con un límite superior descubierto en disco y
  una aserción explícita de que incluye 010.
- [ ] Añadir casos sintéticos que acepten `supplier_sku` y rechacen una declaración real
  de columna `sku`.
- [ ] Ejecutar la prueba enfocada y confirmar todos los casos.
- [ ] Crear el commit `test(catalogo): endurecer los guardianes de la migracion`.

### Tarea 6: Rutas de categorías con ciclos

**Archivos:** modificar `tests/catalogo-categorias.test.ts` y
`app/data/catalogo/categorias.ts`.

**Interfaz:** `rutaDeCategoria(categorias, id)` devuelve `[]` si la ascendencia contiene
un ciclo; una ruta parcial nunca se considera válida.

- [ ] Cambiar la prueba negativa para exigir `[]`.
- [ ] Ejecutarla y observar que falla con la ruta parcial actual.
- [ ] Descartar la cadena cuando `ascendencia` indique ciclo y actualizar el contrato.
- [ ] Repetir la prueba y confirmar que pasa.
- [ ] Crear el commit `fix(catalogo): descartar rutas de categorias ciclicas`.

### Tarea 7: Contratos pendientes y límite de ejecución SQL

**Archivos:** modificar
`docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md`,
`docs/superpowers/plans/2026-09-02-catalogo-relacional.md`, `CLAUDE.md` y
`docs/CONTINUAR-PANEL.md`.

- [ ] Documentar que crear un precio normal cierra la vigencia del normal anterior en
  la misma transacción antes de insertar el nuevo.
- [ ] Documentar que `btree_gist` es una extensión confiable de PostgreSQL, pero que la
  Fase B debe verificar su disponibilidad y el privilegio `CREATE` del rol migrador.
- [ ] Dejar explícito que no hubo ejecución real del SQL: no hay `psql`, PostgreSQL ni
  motor Docker activo en el entorno y no se arrancaron ni instalaron servicios.
- [ ] Crear el commit `docs(catalogo): precisar los requisitos previos de la fase B`.

### Tarea 8: Verificación final

**Archivos:** ninguno adicional salvo correcciones justificadas por las pruebas.

- [ ] Ejecutar las pruebas enfocadas del catálogo y después `npm run test:datos`,
  `npm run test:admin`, `npm run test:proveedores`, `npm run typecheck`, `npm run lint` y
  `npm run build`.
- [ ] Ejecutar `npx playwright test --reporter=line`; si falla, inspeccionar
  `test-results/` antes de cualquier repetición. Informar aparte los cinco fallos por la
  ausencia conocida de `.env.local`/`DATABASE_URL`.
- [ ] Revisar `git diff 7b40e0e`, `git log 7b40e0e..HEAD` y `git status --short --branch`.
- [ ] Confirmar que no se conectó a Neon, no se importó nada, `modelo_catalogo` no cambió
  y no hubo push, merge ni despliegue.
