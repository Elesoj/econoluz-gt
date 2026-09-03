# Subproyecto 5 — carrito persistente de clientes

> **SUB-SKILLS OBLIGATORIAS:** `superpowers:executing-plans`,
> `superpowers:test-driven-development` en cada tarea y
> `superpowers:verification-before-completion` antes de cualquier afirmación de éxito.

**Objetivo:** que el carrito de un cliente con sesión viva en Neon y sobreviva al
dispositivo, sin tocar el carrito anónimo, que sigue siendo local.

**Referencias aprobadas:** diseño global §5.4 (dos tablas) y §8.3 (fusión al iniciar
sesión). `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md` solo sirve para
entender el carrito local que ya existe; **su uso de `stock` está obsoleto** y aquí no se
añade inventario ni disponibilidad.

**Rama:** `feat/carrito-persistente`, worktree `.worktrees/carrito-persistente`, desde
`80410e5`.

## Restricciones

- **Sin escrituras en Neon Producción, sin tocar Vercel Production, sin Firebase
  Producción, sin push, sin merge y sin despliegue.**
- El desarrollo real va contra una rama Neon nueva `carrito-persistente-dev` y el Firebase
  de desarrollo `econoluz-dev-d30ab`.
- No se reconstruye el carrito anónimo ni se cambia su diseño visual más allá de lo que
  exija sincronizarlo.
- Nada de checkout, pedidos, pagos, envíos ni FEL. Nada de `stock`.
- Español de España en comentarios y mensajes de commit.

---

## Decisiones de diseño que este plan fija

**1. `cart_items` apunta al producto por su clave interna.** La fila lleva
`product_id` con clave foránea a `products(id)`, no la referencia pública. La referencia
es lo que habla el navegador; traducirla a la clave del producto es trabajo del servidor,
y así la base no guarda dos identificadores del mismo producto que puedan divergir.

**2. El catálogo entra por un puerto, no por una consulta incrustada.** La lógica de
fusión recibe una función «dame estos productos» y devuelve qué descarta. Hoy la
implementación del puerto hace **una sola consulta** a `products` pidiendo únicamente
`id`, `econoluz_reference`, `published` y `price_gtq` —ninguna columna del proveedor—;
cuando el subproyecto 11 retire esa tabla, se cambia el puerto y no la lógica.

**3. El tope de 999 se comparte con el carrito local.** `CANTIDAD_MAXIMA_POR_LINEA` ya
existe en `app/tienda/carrito.ts` y es la misma regla; duplicarla sería tener dos topes
que algún día no coincidan.

**4. La fusión es idempotente por token.** `carts.fusion_token` guarda el token de la
última fusión aplicada. Repetir la petición con el mismo token devuelve el carrito tal
como quedó, **sin volver a sumar**. El token lo genera el navegador y viaja en el cuerpo.

**5. Un carrito por usuario.** `carts.user_id` es único. Eso hace que «crear si no
existe» sea un `insert … on conflict do nothing` y que dos peticiones concurrentes no
puedan crear dos carritos.

---

## Tarea 1: la migración `011`

**Archivos:** crear `db/011_carrito.sql` y `tests/carrito-migracion.test.ts`.

Dos tablas y ni una más. `carts` con `id`, `user_id` único con clave foránea a `users`,
`fusion_token`, `creado_en` y `actualizado_en`. `cart_items` con `id`, `cart_id`,
`product_id`, `cantidad` entre 1 y 999, fechas, y **único `(cart_id, product_id)`**: una
fila por producto. Ninguna columna de precio, nombre, imagen, proveedor ni existencias.

Borrado en cascada desde el usuario y desde el carrito; desde el producto también, porque
una línea sin producto no significa nada.

**El rol público queda fuera de forma explícita**, con `revoke` sobre las dos tablas: no
basta con no concederle nada, porque una concesión futura por descuido pasaría inadvertida.

Aditiva, transaccional y repetible: `create table if not exists` y `create index if not
exists`, como las diez anteriores.

Pruebas sobre el **texto** del `.sql` —igual que `catalogo-migracion`— para que nadie
quite una restricción sin enterarse; la ejecución real llega en la Tarea 6.

## Tarea 2: la lógica de fusión, pura

**Archivos:** crear `app/tienda/carritoServidor.ts` y `tests/carrito-fusion.test.ts`.

Sin React, sin base de datos, sin `server-only`: funciones que reciben datos y devuelven
datos.

- `fusionarLineas(remotas, locales, catalogo)`: suma cantidades por referencia, **limita
  cada línea a 999** y devuelve las líneas resultantes **y los descartes con su motivo**
  (`inexistente`, `despublicado`, `sin-precio`).
- `decidirFusion(carritoGuardado, tokenPedido)`: si el token coincide con el de la última
  fusión, la respuesta es «ya aplicada» y no se suma nada.

Ciclo por regla: prueba que falla, mínimo para pasarla, rotura deliberada.

## Tarea 3: los contratos de la API

**Archivos:** crear `app/tienda/carritoContratos.ts` y `tests/carrito-contratos.test.ts`.

Tipos y validadores compartidos entre las rutas de hoy y la API móvil del subproyecto 10:
tamaño máximo del cuerpo, forma de las líneas, referencias, cantidades y el token. Los
errores son **códigos tipados** (`cuerpo-invalido`, `referencia-invalida`,
`cantidad-invalida`, `sin-sesion`, `origen-no-valido`, `carrito-no-disponible`), nunca
texto de PostgreSQL ni datos privados.

**Ningún precio se acepta del navegador**, y hay una prueba que lo fija: un cuerpo que
traiga precios se valida ignorándolos.

## Tarea 4: el servicio contra Neon

**Archivos:** crear `app/tienda/carrito.server.ts` y `tests/carrito-servicio.test.ts`.

`obtenerCarrito`, `fijarCantidad`, `eliminarLinea`, `vaciarCarrito` y `fusionarCarrito`,
todas recibiendo el **identificador del usuario ya verificado**, nunca del cuerpo.

La fusión va entera dentro de `escribir()`: crea el carrito si falta, **bloquea su fila
con `select … for update`**, lee las líneas, aplica la lógica pura, escribe el resultado,
guarda el token y confirma. Si algo falla, la transacción se deshace completa.

Las pruebas usan un ejecutor de mentira que registra las sentencias: así se comprueba el
bloqueo, el orden, el `rollback` y que **ninguna consulta acepta un identificador de
usuario que no sea el del parámetro**.

## Tarea 5: los endpoints

**Archivos:** crear `app/api/v1/carrito/route.ts` (GET obtener, DELETE vaciar),
`app/api/v1/carrito/linea/route.ts` (PUT fijar, DELETE eliminar) y
`app/api/v1/carrito/fusionar/route.ts` (POST), más `tests/carrito-rutas.test.ts`.

Todas: `runtime = "nodejs"`, mismo origen obligatorio en las mutaciones, sesión de la
cookie verificada de Firebase, cuerpo acotado, respuesta saneada.

## Tarea 6: Neon de desarrollo

Crear la rama `carrito-persistente-dev` desde Producción, comprobar **nombre,
identificador y endpoint** antes de nada, aplicar `011` allí con simulación previa, y
comprobar con `test:permisos` que el rol público sigue sin poder leer las dos tablas
nuevas.

## Tarea 7: la interfaz

**Archivos:** `app/tienda/carritoStore.ts`, `useCarrito.ts`, `carritoRemoto.ts` (nuevo),
`SincronizarCarrito.tsx` (nuevo) y el layout.

- Sin sesión, todo sigue igual: `localStorage` y nada más.
- Con sesión, el servidor manda. El store gana un modo, y en modo remoto no persiste en
  `localStorage`.
- Al aparecer la sesión se fusiona **una sola vez**, con un token guardado hasta que la
  fusión tenga éxito. El carrito anónimo se borra **solo después del éxito**.
- Al desaparecer la sesión se limpia el carrito privado del navegador: un dispositivo
  compartido no puede quedarse con la compra de otro.
- Actualización optimista solo donde revierte bien al fallar.
- Contador, accesibilidad y aspecto, intactos.

## Tarea 8: verificación y cierre

Pruebas nuevas y existentes del carrito, `test:datos`, `test:admin`, `test:proveedores`,
`test:permisos`, `typecheck`, `lint`, `build` y Playwright contra Neon y Firebase de
desarrollo. `docs/CONTINUAR-PANEL.md` y `CLAUDE.md` al día, árbol limpio y commits
pequeños en español. **Sin push, sin merge y sin despliegue.**
