# Catálogo relacional — plan de la Fase D (activación escalonada en Producción)

> **Para quien ejecute esto con agentes:** SUB-SKILLS OBLIGATORIAS:
> `superpowers:executing-plans`, `superpowers:test-driven-development` en cada tarea de
> código y `superpowers:verification-before-completion` antes de cualquier afirmación de
> éxito.

**Objetivo:** que el catálogo público de Producción se sirva del modelo relacional
(`relational_v2`), con el modelo antiguo intacto y la reversión a `legacy` disponible en
menos de un minuto y sin desplegar.

**Autorización del dueño (02/09/2026), expresa y acotada:** aplicar las migraciones
pendientes en Neon Producción; importar allí el catálogo relacional; configurar
`DATABASE_URL_PUBLIC` y `FASE_D_AUTORIZADA` en Vercel Production; fusionar por avance
rápido, hacer push de `main` y desplegar Production; cambiar `modelo_catalogo` a `shadow`
y después a `relational_v2`; y volver a `legacy` de inmediato si algo falla.

**Lo que NO autoriza:** borrar el modelo antiguo, ramas, worktrees ni datos históricos.
El subproyecto 11 (retirada de `products.stock` y compañía) **no empieza aquí**.

---

## Estado comprobado antes de empezar (02/09/2026)

Comprobado con `neonctl`, `vercel` y una transacción de solo lectura contra Producción,
no copiado de documentos anteriores:

| Hecho | Valor comprobado |
|---|---|
| Proyecto Neon | `dry-firefly-38616588` (`econoluz`) |
| Rama de Producción | `main` = `br-flat-dew-avc2njed`, predeterminada |
| Endpoint de Producción | `ep-misty-sun-avmcbgly` |
| Rama de desarrollo de la Fase B/C | `catalogo-relacional-fase-b` = `br-quiet-hat-avozt905`, endpoint `ep-green-union-avi3x99e` |
| Migraciones aplicadas en Producción | `001`–`008`. **Pendientes: `009` y `010`** |
| `modelo_catalogo` en Producción | `legacy` |
| Productos / proyección pública | 313 / 313 |
| Precios (`price_gtq` no nulo) | **25**. Faltan 288 y **no se inventan** |
| Galerías | 6 con galería, **0** que repiten la principal (limpieza ya aplicada) |
| Rol público en Producción | `econoluz_publico` existe |
| `FASE_D_AUTORIZADA` en Vercel | **no existe** ⇒ vale `false` |
| `DATABASE_URL_PUBLIC` en Vercel Production | existe, valor opaco (secreto). **Sin consumidor en el código desplegado** |
| `main` local vs `origin/main` | 41 commits sin publicar (subproyecto 2, identidad) |
| `feat/catalogo-relacional` | `826503d`, worktree limpio, `main` es su ancestro ⇒ avance rápido posible |

**Riesgo detectado y aceptado por el alcance autorizado:** el push de `main` publica
también el subproyecto 2 (identidad de clientes), que hoy no está en Producción. Sus
variables (`FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_*`, `AUTH_EVENT_IP_PEPPER`) no
están configuradas en Production y el dueño ha pedido expresamente **no** activarlas en
esta fase. Ninguna navegación pública enlaza `/cuenta`, así que la funcionalidad viaja
apagada; entrar a mano en esas rutas dará error controlado, no caída del sitio.

---

## Tarea 1: abrir los caminos de Producción en las herramientas (TDD)

Hoy cuatro scripts están sellados a la rama de desarrollo y **la Fase D es imposible sin
tocarlos**. No se relaja el guardián: se añaden caminos aparte, explícitos.

1. **`scripts/guarda-neon.mjs`** — `decidirDestinoDeLectura(argumentos)` y
   `exigirDestinoDeLectura(cliente, entorno, destino)`: para operaciones de **solo
   lectura**, `--produccion` exige estar conectado justo al endpoint de Producción; sin
   la bandera, sigue el guardián de rama de siempre.
2. **`scripts/modelo-catalogo.mjs`** — acepta `relational_v2` y gana el camino de
   Producción con **las tres llaves** (`--produccion`, `PERMITIR_ESCRITURA_PRODUCCION=true`
   y `CONFIRMAR_PRODUCCION=modelo-catalogo-en-produccion`).
3. **`scripts/importar-catalogo-relacional.mjs`** — `--aplicar-produccion` con las tres
   llaves y `CONFIRMAR_PRODUCCION=importar-relacional-en-produccion`, conservando la
   transacción única y la reversión por conteo.
4. **`scripts/comparar-catalogo-shadow.mjs`** y **`scripts/verificar-catalogo-relacional.mjs`**
   — camino `--produccion` de solo lectura.
5. **`scripts/migrate.mjs`** — `--simular`: aplica lo pendiente dentro de una transacción
   y hace `ROLLBACK`, para ver de verdad que el SQL entra antes de escribir.

Cada punto con su prueba que falla primero, y la prueba guardiana ampliada para que
ninguno de los cuatro pierda su autorización sin que salte una prueba.

## Tarea 2: preparar y probar la reversión antes de necesitarla

El procedimiento de vuelta atrás es una sola orden y no depende de ningún despliegue:

```bash
PERMITIR_ESCRITURA_PRODUCCION=true CONFIRMAR_PRODUCCION=modelo-catalogo-en-produccion \
npm run catalogo:relacional:modelo -- --poner legacy --produccion
```

Se prueba de verdad en la Tarea 6, cuando se ponga `shadow` y se vuelva a `legacy` antes
de seguir: una reversión que solo existe en el papel no es una reversión.

## Tarea 3: migraciones `009` y `010` en Producción

Simulación primero (`db:migrar -- --simular`), después la aplicación real. Se comprueba
que quedan aplicadas exactamente las diez y que `btree_gist` existe.

## Tarea 4: importar los 313 productos en Producción

Simulación, importación real exigiendo **0 rechazados**, y **segunda importación** que
debe dar **0 modificados y 313 omitidos**. Si algún conteo no cuadra, la transacción se
revierte sola.

## Tarea 5: verificar Producción manteniendo `legacy`

- `catalogo:relacional:verificar --produccion`: `ok: true`.
- `test:permisos` contra el rol público de Producción: solo `public_products` legible.
- `catalogo:relacional:comparar --produccion`: **0 diferencias**, 0 escrituras.
- Conteos de relaciones, imágenes, atributos, precios y proyección pública.
- `modelo_catalogo` sigue en `legacy` todo el rato.

## Tarea 6: Vercel, integración y despliegue cerrado

- `DATABASE_URL_PUBLIC` de Producción (rol `econoluz_publico`), obtenida de Neon y
  **nunca impresa ni escrita en ningún archivo**.
- `FASE_D_AUTORIZADA=false`, explícita.
- Batería completa, fusión `--ff-only`, push normal, despliegue y comprobación de que
  Producción **sigue sirviendo `legacy`**.

## Tarea 7: `shadow` en Producción

`modelo_catalogo = shadow` y comprobación breve: el visitante recibe `legacy`, 0
diferencias, 6 consultas internas, 0 escrituras, 0 errores y 0 datos privados en los logs.

## Tarea 8: `relational_v2`

`FASE_D_AUTORIZADA=true`, redespliegue con la base todavía en `shadow`, verificación de
que `shadow` sigue bien, y solo entonces `modelo_catalogo = relational_v2`, invalidación
de caché y verificación completa: una sola consulta cacheada a `public_products` por el
rol público, páginas, carrito, precios, imágenes, permisos, privacidad y bundles.

## Reversión automática

Ante cualquier error, diferencia, producto ausente, fuga, respuesta 500 o regresión:
`modelo_catalogo = legacy` de inmediato, comprobar que el sitio se recuperó, **no** borrar
tablas ni deshacer migraciones aditivas, e informar con evidencia saneada.
