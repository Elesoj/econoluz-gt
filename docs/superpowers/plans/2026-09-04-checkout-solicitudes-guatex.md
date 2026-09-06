# Checkout, pedidos y solicitudes de Guatex — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Cada paso lleva
> casillas (`- [ ]`) para seguimiento estricto.

**Dependencia expresa:** este plan **depende directamente del Plan A** (`docs/superpowers/plans/2026-09-04-correccion-envios-operativos.md`). Requiere que el dominio de envíos operativos, el cálculo con coste desconocido para Guatex (`null`), la zona capitalina, la configuración oficial de `app/envios/configuracion.ts`, la migración 015 y el ayudante de autenticación real de clientes `tests/helpers/cliente-e2e.ts` estén implementados.

**Objetivo:** implementar el flujo completo de checkout de ECONOLUZ distinguiendo con claridad sus dos salidas:
1. **Mensajero propio:** pedido creado en estado `pendiente_de_pago`, con cálculo oficial de envío (Q35,00 o gratis) listo para una futura pasarela de pago digital (subproyecto 7).
2. **Guatex:** solicitud creada en estado `pendiente_de_contacto`, con coste de envío desconocido (`null`, nunca 0), que muestra al cliente la pantalla exacta aprobada con su número de referencia dinámico (`#EC-2K7M9P4XBW` como referencia real), sin abrir WhatsApp ni cambiar de aplicación en su dispositivo. En el panel administrativo de pedidos, un administrador autenticado puede pulsar «Contactar por WhatsApp» para abrir el chat en su propio dispositivo.

**Arquitectura:**
1. **Autenticación obligatoria e identidad real:**
   - No existe checkout como invitado. La columna `orders.user_id` es `bigint NOT NULL REFERENCES users(id)`.
   - La identidad se lee exclusivamente mediante `leerClienteActual()` de `app/identidad/sesion.server.ts` (devuelve `ClienteActual | null` con `id: string`).
   - Si la sesión no existe o caduca: el carrito del servidor permanece intacto, se redirige a `/cuenta/entrar?redirigir=/checkout`.
   - La ruta `/cuenta/entrar` es la ruta legítima de acceso. Con el parámetro `?redirigir=/checkout` redirige de vuelta al checkout. No deben emplearse rutas obsoletas ni inventadas.
   - Modificación de `app/cuenta/entrar/page.tsx` y `app/cuenta/ClienteFirebase.tsx` para aceptar el parámetro `redirigir` y volver a `/checkout` tras iniciar sesión, validando el destino mediante el módulo puro `app/cuenta/seguridadRedirigir.ts` (`sanitizarRutaRedirigir`) contra la lista blanca permitida (`["/checkout", "/carrito", "/cuenta"]`).
   - Aislamiento estricto de clientes e IDOR: el cliente solo consulta sus propios pedidos (`WHERE user_id = $1` con el id de sesión). La pantalla de confirmación valida la titularidad. El panel administrativo utiliza autenticación separada (`admin_users`) y sesión administrativa.
   - **La sesión del cliente es la de verdad, también en las pruebas.** `COOKIE_SESION_CLIENTE` vale `"econoluz_cliente"` y `leerSesionDeCliente` la comprueba con `auth().verifySessionCookie(cookie, true)` en `app/identidad/firebase.server.ts`. Por eso **está prohibido fabricar una cookie de sesión** —con JSON codificado en Base64 o de cualquier otra forma—: no la aceptaría la aplicación real y la prueba solo demostraría que el bypass funciona. El flujo E2E honesto está descrito en la tarea 13 y vive en `tests/helpers/cliente-e2e.ts`, creado por el Plan A.
2. **Tipos reales del catálogo y carrito:**
   - `products.id` es de tipo `text`.
   - `cart_items.product_id` es de tipo `text`.
   - `cart_items` no contiene `econoluz_reference`.
   - Para obtener referencia, precio y estado del producto hay que unir `cart_items` con `products`.
   - Columnas reales en `products`: `p.id`, `p.econoluz_reference`, `p.public_name`, `p.price_gtq`, `p.published` (el catálogo no tiene columna de título, se utiliza `public_name`).
   - La cantidad se llama `cantidad` en el carrito existente (`ci.cantidad`), no `quantity`.
   - Por tanto, `order_items.product_id` es `text NOT NULL REFERENCES products(id)`, y se almacena `snapshot_title` con `p.public_name`.
   - **`user_addresses.id` es `bigserial`** (ver `db/009_identidad_clientes.sql`), no un UUID. El identificador de dirección guardada que llega del formulario se valida como entero positivo en texto, y además se comprueba la pertenencia al cliente con `WHERE id = $1 AND user_id = $2`. El único identificador con forma de UUID que valida el checkout es `idempotencyKey`, que genera la propia aplicación con `crypto.randomUUID()`.
3. **Referencias públicas de pedido:**
   - Prefijo `EC-` seguido de 10 caracteres criptográficos no ambiguos generados con `crypto` a partir del alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin 0, 1, I ni O, con distribución sin sesgo, ej. `EC-2K7M9P4XBW`).
   - Restricción `UNIQUE` en PostgreSQL.
   - Bucle de reintento acotado (hasta 3 intentos) si PostgreSQL informa de colisión (código `23505`).
   - Nunca usar la referencia pública como autorización. La pantalla muestra la referencia real generada dinámicamente.
   - **Toda referencia literal que aparezca en pruebas o fixtures cumple `^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$`.** Una referencia con `0`, `1`, `I` u `O`, o con longitud distinta de diez, la rechaza `chk_orders_reference_format` y la prueba fallaría por el motivo equivocado.
4. **Idempotencia y orden transaccional:**
   - Transacción atómica en `escribir()`:
     1. Bloquear la fila de `carts` del usuario con `SELECT id FROM carts WHERE user_id = $1 FOR UPDATE`.
     2. Buscar inmediatamente si ya existe un pedido para `(user_id, idempotency_key)`.
     3. Si existe, devolver ese pedido sin exigir líneas y sin vaciar nada.
     4. Solo si no existe, bloquear y leer `cart_items` unidos con `products`: `SELECT ci.product_id, ci.cantidad, p.econoluz_reference, p.public_name, p.price_gtq, p.published FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = $1 FOR UPDATE OF ci`.
     5. Validar productos activos y recalcular precios en el servidor.
     6. Deducir soberanamente el método de envío (`mensajero_propio` o `guatex`) con la configuración de `app_settings` leída bajo `FOR SHARE`.
     7. Si el método definitivo es `mensajero_propio`, comprobar síncronamente la disponibilidad de pago (`proveedorPago.estaConfigurado()`). Si no está configurada, abortar inmediatamente la transacción sin insertar pedidos ni líneas y sin vaciar el carrito, devolviendo el resultado tipado `{ ok: false, codigo: "PAGO_NO_DISPONIBLE", error: string }`.
     8. Insertar pedido en `orders`, líneas en `order_items`, dirección en `order_addresses` y registrar en `audit_log`.
     9. Vaciar únicamente las líneas que pertenecen al carrito bloqueado: `DELETE FROM cart_items WHERE cart_id = $1`.
     10. `COMMIT`.
   - **Ante peticiones idempotentes previas:** antes de evaluar ajustes o pasarela, si ya existe un pedido para `(user_id, idempotency_key)`, se devuelve inmediatamente el pedido guardado según su propio `shipping_method` original. No se bloquea ni se re-evalúa contra la configuración actual de zonas.
   - **Ante la colisión de `orders_user_idempotency_unique`** —dos peticiones concurrentes que se cruzan— se relee el pedido por `(user_id, idempotency_key)`, se suman las unidades de `order_items` del pedido releído y se devuelve el DTO completo. Nunca se usan los datos del carrito actual, no se reinsertan líneas y no se vuelve a vaciar el carrito.
5. **Frontera de pago explícita (`ProveedorPago`) y deducción soberana única:**
   - Un único contrato en todo el documento:
     ```ts
     export type PedidoParaPago = {
       orderId: string;
       reference: string;
       totalCents: number;
     };

     export type ResultadoInicioPago = {
       urlPago: string;
       transaccionId: string;
     };

     export interface ProveedorPago {
       estaConfigurado(): boolean;
       iniciarPago(pedido: PedidoParaPago): Promise<ResultadoInicioPago>;
     }
     ```
   - `PedidoParaPago` **no lleva `clienteId`**: la pasarela no necesita saber quién compra para cobrar un importe, y no se le envían datos que no le hagan falta.
   - `ResultadoInicioPago` tiene **exactamente dos propiedades, `urlPago` y `transaccionId`**, y esas son las únicas que se usan en todo el documento. No hay ningún segundo nombre para la dirección de la pasarela, ni ninguna respuesta del proveedor que lleve una bandera `ok`.
   - **Solo existe una deducción soberana del método para pedidos nuevos:** la realizada dentro de `crearPedidoTransaccional` bajo `FOR SHARE` en `app_settings`. El orquestador no realiza ninguna deducción preliminar ni depende de una lista de zonas duplicada, erradicando cualquier condición de carrera TOCTOU.
   - Si el método definitivo es `mensajero_propio` y `proveedorPago.estaConfigurado()` es `false`: la transacción termina con cero INSERT y cero DELETE del carrito, devolviendo un error tipado o resultado discriminado `{ ok: false, codigo: "PAGO_NO_DISPONIBLE", error: string }`.
   - Cuando exista un proveedor configurado: se crea el pedido `pendiente_de_pago` y se vacía el carrito en la transacción; **únicamente después del `COMMIT` se invoca `iniciarPago`**. Nunca se mantiene una transacción PostgreSQL abierta durante una llamada de red externa.
   - Si el proveedor configurado falla después del `COMMIT`, el pedido se conserva en `pendiente_de_pago` como operación recuperable (`recuperable: true`) y no se simula que está pagado. El reintento recupera el pedido por `reference` y `user_id`, exige `pendiente_de_pago` y `mensajero_propio`, reutiliza el pedido existente y no crea ninguno nuevo.
6. **Configuración oficial de envíos y ausencia de listas duplicadas:**
   - La configuración oficial se lee y bloquea de forma atómica dentro de la transacción de creación de pedidos en `crearPedidoTransaccional`.
   - El orquestador `app/checkout/orquestacion.ts` no depende de `obtenerMetodosZonas` ni mantiene listas de respaldo en código (`[6, 17, 18]`). Si la configuración oficial en `app_settings` no puede leerse bajo `FOR SHARE`, la transacción revierte y el checkout falla de forma segura: devuelve `{ ok: false }` y el carrito del cliente queda 100% intacto.
7. **Feature flag segura (`checkout_activo`):**
   - Clave en `app_settings` que nace en `'false'` (texto plano sin conversión a tipo JSON).
   - Fallback seguro a `false` si falta, está corrupta o la base de datos falla.
   - Validada en página, Server Actions y APIs. No depende de middleware con acceso a base de datos.
   - Impide cualquier `INSERT` en pedidos cuando está apagada.
   - La desactivación de checkout **no impide** que el cliente consulte `/checkout/confirmacion/[referencia]` de pedidos ya creados con anterioridad a la desactivación, verificando siempre la titularidad `orders.user_id = sesion.cliente.id`.
8. **Regla fiscal SAT Guatemala:**
   - Umbral legal fiscal: **Q2.500,00** (250.000 centavos) sobre el **TOTAL FACTURADO FINAL** (productos + envío).
   - Menor a Q2.500: CF o NIT.
   - Igual o superior a Q2.500: NIT o CUI (exactamente 13 dígitos numéricos). CF prohibido terminantemente.
   - Comprobación local de NIT valida formato/normalización; validez fiscal definitiva corresponderá a FEL.
   - No se ofrecen opciones para extranjeros por decisión comercial expresa del dueño (no atribuir a prohibición SAT).
   - Semántica única: `fiscal_verificado = false` solamente para Guatex con CF pendiente; mensajero propio y Guatex con NIT/CUI nacen con `fiscal_verificado = true`. La necesidad de verificación administrativa se deriva de (`shipping_method === 'guatex' && fiscal_tipo === 'cf' && !fiscal_verificado`).
   - **`ResultadoValidacionFiscal` se consume por sus propiedades planas** —`tipo`, `numero`, `nombre`, `verificado`— tras estrechar por `ok`. No existe ninguna propiedad `datos` en el resultado.
9. **Máquina de estados cerrada (módulo puro `app/pedidos/estados.ts`):**
   - Guatex:
     - `pendiente_de_contacto` -> `contactado`
     - `pendiente_de_contacto` -> `cancelado`
     - `contactado` -> `cerrado` (exige `fiscal_verificado = true`)
     - `contactado` -> `cancelado`
   - Mensajero propio:
     - Permanece en `pendiente_de_pago` hasta que el subproyecto 7 de pago defina estados adicionales.
     - Prohibido cerrarlo manualmente como si estuviese pagado.
10. **Permisos administrativos:**
    - Añadir `puedeLeerPedidos` y `puedeEscribirPedidos` en `app/admin/auth/permisos.ts`, y los permisos `pedidos:leer` y `pedidos:escribir` en `app/admin/auth/authorization.server.ts`.
    - **`pedidos:leer` se concede a `administrador` y a `empleado`.** **`pedidos:escribir` se reserva al rol `administrador`.** Las páginas administrativas, las Server Actions y las pruebas usan exactamente ese reparto.
    - El rol se relee de `admin_users` en cada acción, como ya hace `verificarPermisoParaAccion`.
11. **Lógica pura y pruebas sin servidor:**
    - Las pruebas de `node:test` importan **módulos puros**, nunca módulos con `server-only` ni Server Actions.
    - Se extraen a módulos puros la transición de estados (`app/pedidos/estados.ts`), la validación fiscal (`app/pedidos/fiscal.ts`), la decisión administrativa de transición y verificación fiscal (`app/admin/pedidos/logicaTransicion.ts`) y la autorización por rol (`app/admin/auth/permisos.ts`).
12. **WhatsApp y privacidad:**
    - Generador de enlace puro `app/admin/pedidos/enlaceWhatsapp.ts` con función `construirEnlaceWhatsapp(telefono: string, referencia: string): string`.
    - Botón en `/admin/pedidos/[id]` para el administrador autenticado.
    - Teléfono normalizado a dígitos, enlace `https://wa.me/50212345678?text=...` con `target="_blank" rel="noopener noreferrer"`.
    - Mensaje seguro que incluye exclusivamente saludo y referencia pública del pedido. Sin NIT, CUI, dirección ni datos sensibles en el texto.
13. **Notificación durable y aviso por correo:**
    - Registro en `/admin/pedidos` como notificación durable principal.
    - Notificación por correo best-effort en `app/pedidos/notificacion.server.ts` siguiendo el patrón de `app/api/leads/route.ts`: si faltan variables o falla el envío, no revertir el pedido y registrar únicamente la clase del error sin datos personales ni fiscales.
14. **Prueba E2E de Playwright:**
    - Registrada en `playwright.config.ts` bajo `testMatch` como `"checkout-pedidos.spec.ts"`.
    - Autenticación real de clientes con el emulador de Firebase Authentication a través de la frontera real de la aplicación (`POST /api/clientes/sesion`). Sin emulador ni credenciales E2E autorizadas, la suite **falla explícitamente** en lugar de degradar a un atajo.

**Stack:** Next.js 16.3.1 (App Router), React 19, TypeScript 5.9.3, Node.js 24, PostgreSQL 18 en Neon (`@neondatabase/serverless`), `node --test` y Playwright (`msedge`).

**Especificación de referencia:**
`docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md`.

---

## Restricciones globales

- **Autenticación obligatoria**: solo clientes con sesión activa pueden acceder al checkout y crear pedidos.
- **Ruta real de acceso**: `/cuenta/entrar?redirigir=/checkout`. La ruta `/cuenta/entrar` es válida sin retorno cuando no se requiere volver al checkout.
- **Prohibido fabricar sesiones**: ninguna prueba, script ni módulo construye una cookie de cliente a mano. La cookie del cliente se llama exactamente `COOKIE_SESION_CLIENTE` —cuyo valor literal es `econoluz_cliente`, definido en `app/identidad/sesion.ts`— y solo la emite `crearCookieDeSesion` desde `POST /api/clientes/sesion`. Cualquier otro nombre de cookie que aparezca en una propuesta es inventado y hay que rechazarlo.
- **El coste de Guatex se guarda como `null` (desconocido)**: NUNCA 0. Guardar 0 significaría falsamente que el envío es gratuito.
- **La pantalla del cliente NO abre WhatsApp**: muestra la confirmación exacta aprobada con la referencia real generada.
- **El botón «Contactar por WhatsApp» se abre ÚNICAMENTE en el dispositivo del administrador** desde la ficha del pedido en `/admin/pedidos/[id]`.
- **Frontera de pago**: no simular pagos exitosos en Producción. `estaConfigurado()` devuelve `false` y no crea pedidos huérfanos.
- **Sin respaldos comerciales escritos en el código**: la asignación de zona a método sale siempre de `app_settings`. Si no puede leerse, el checkout se niega a crear el pedido.
- **Idempotencia compuesta**: `UNIQUE (user_id, idempotency_key)`.
- **Conservación del carrito**: si falla la transacción o si el pago no está configurado, el carrito del cliente permanece 100% intacto.
- **El rol público (`econoluz_publico`) tiene prohibido el acceso a las tablas de pedidos**.
- **Privacidad estricta**: ningún dato personal ni fiscal (NIT, CUI, teléfono, nombre) en logs estructurados ni en URLs públicas.
- **Ninguna base que no sea de desarrollo o E2E**: todo script y toda prueba que escriba comprueba positivamente contra qué rama de Neon está conectada y rechaza Producción.
- **Idioma**: Español de España.

---

## Estructura de archivos

### Archivos para crear
| Archivo | Responsabilidad |
|---|---|
| `app/cuenta/seguridadRedirigir.ts` | Módulo puro de saneamiento y validación de URLs de redirección interna (`/cuenta/entrar?redirigir=/checkout`). |
| `db/016_pedidos_y_solicitudes.sql` | DDL estricto: `orders`, `order_items`, `order_addresses`, restricciones, checks, índices, siembra y revocaciones. |
| `app/pedidos/referencia.ts` | Generador de referencias públicas con prefijo `EC-` y 10 caracteres criptográficos no ambiguos (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`). |
| `app/pedidos/contratos.ts` | Tipos de dominio, estados (`EstadoPedido`), tipos fiscales, DTOs de creación, `ParametrosCheckout`, `DireccionGuardadaDto` y su adaptador seguro. |
| `app/pedidos/estados.ts` | Módulo puro con la máquina de estados (`puedeTransicionarPedido`). |
| `app/pedidos/fiscal.ts` | Lógica pura de validación fiscal SAT (umbral Q2.500 sobre total facturado, CF, NIT, CUI de 13 dígitos, validación estricta de importes). |
| `app/pedidos/pago.ts` | Interfaz `ProveedorPago`, tipos de inicio de pago e implementación por defecto no configurada. |
| `app/pedidos/pedidosRepositorio.ts` | Núcleo inyectable puro de persistencia transaccional (probado sin `server-only`, reintento con SAVEPOINT anti-colisión). |
| `app/pedidos/pedidos.server.ts` | Wrapper con `server-only` que inyecta el cliente real de Neon sobre `pedidosRepositorio.ts`. |
| `app/pedidos/notificacion.ts` | Núcleo inyectable de aviso por correo (Resend) desacoplado de la transacción (formateo con `formatPrice`). |
| `app/pedidos/notificacion.server.ts` | Wrapper con `server-only` para notificación por correo. |
| `app/checkout/orquestacion.ts` | Módulo funcional puro del checkout: dependencias inyectables, invocación transaccional soberana y flujo post-`COMMIT`. |
| `app/checkout/checkout.server.ts` | Wrapper con `server-only` que inyecta Neon, `crearPedido` y el proveedor de pago. |
| `app/checkout/validacionEntrada.ts` | Módulo puro de validación y normalización de la entrada del formulario de checkout. |
| `app/checkout/actions.ts` | Server Actions completas para procesar la compra o solicitud de pedido y para reintentar el pago. |
| `app/checkout/FormularioCheckout.tsx` | Client Component con selector geográfico encadenado, datos fiscales y botón de reintento de pago. |
| `app/checkout/page.tsx` | Pantalla de checkout completa con verificación de sesión y formulario encadenado. |
| `app/checkout/confirmacion/[referencia]/page.tsx` | Pantalla de confirmación completa con el mensaje aprobado y validación de titularidad. |
| `app/admin/pedidos/enlaceWhatsapp.ts` | Módulo puro para construir enlaces de WhatsApp seguros para el administrador con teléfono guatemalteco. |
| `app/admin/pedidos/logicaTransicion.ts` | Módulo puro con la decisión de transición de estado y de verificación fiscal administrativa. |
| `app/admin/pedidos/actions.ts` | Server Actions para transiciones de estado y verificación fiscal administrativa con auditoría. |
| `app/admin/(panel)/pedidos/page.tsx` | Listado de pedidos y solicitudes en el panel. |
| `app/admin/(panel)/pedidos/[id]/page.tsx` | Ficha completa del pedido con detalles, instantánea de dirección, datos fiscales y botón WhatsApp. |
| `tests/checkout-ajustes.test.ts`, `tests/cuenta-seguridad-redirigir.test.ts`, `tests/pedidos-migracion-016.test.ts`, `tests/pedidos-referencia.test.ts`, `tests/pedidos-contratos.test.ts`, `tests/pedidos-estados.test.ts`, `tests/pedidos-fiscal.test.ts`, `tests/pedidos-pago.test.ts`, `tests/pedidos-servicio.test.ts`, `tests/pedidos-notificacion.test.ts`, `tests/checkout-validacion.test.ts`, `tests/checkout-orquestador.test.ts`, `tests/admin-enlace-whatsapp.test.ts`, `tests/admin-pedidos-permisos.test.ts`, `tests/admin-pedidos.test.ts` | Pruebas unitarias sobre módulos puros. |
| `tests/checkout-pedidos.spec.ts` | Pruebas E2E de Playwright del flujo completo de checkout y gestión administrativa con autenticación real de Firebase. |

### Archivos para modificar
| Archivo | Responsabilidad |
|---|---|
| `app/lib/ajustes.ts` / `app/lib/ajustes.server.ts` | Feature flag seguro `checkout_activo` en `app_settings`. |
| `app/cuenta/entrar/page.tsx` / `app/cuenta/ClienteFirebase.tsx` | Consumir el parámetro `redirigir` saneado. |
| `app/admin/auth/permisos.ts` / `app/admin/auth/authorization.server.ts` | Permisos `pedidos:leer` (administrador y empleado) y `pedidos:escribir` (solo administrador). |
| `app/admin/(panel)/page.tsx` | Enlace a la nueva sección de pedidos. |
| `tests/helpers/cliente-e2e.ts` | Reemplazar el cuerpo de `limpiarClienteE2E` por la versión final ampliada con pedidos y claves foráneas. |
| `playwright.config.ts` | Añadir `checkout-pedidos.spec.ts` a `testMatch` (conservando la carga de `.env.local` con `loadEnvConfig`). |
| `package.json` | Dar de alta las pruebas unitarias nuevas en `test:datos` y `test:admin`. |
| `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` | Registrar el estado del subproyecto 6. |

---

## Tareas de implementación

### Tarea 1: Feature flag seguro `checkout_activo` en `app_settings`

**Files:**
- Modificar: `app/lib/ajustes.ts`
- Modificar: `app/lib/ajustes.server.ts`
- Crear: `tests/checkout-ajustes.test.ts`

**Interfaces:**
- En `app/lib/ajustes.ts`:
  ```ts
  export const CLAVE_CHECKOUT_ACTIVO = "checkout_activo";
  export function interpretarCheckoutActivo(valor: unknown): boolean;
  ```
- En `app/lib/ajustes.server.ts`:
  ```ts
  export async function obtenerCheckoutActivo(): Promise<boolean>;
  export async function guardarCheckoutActivo(activo: boolean, actorId: string): Promise<void>;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/checkout-ajustes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { CLAVE_CHECKOUT_ACTIVO, interpretarCheckoutActivo } from "../app/lib/ajustes";

test("CLAVE_CHECKOUT_ACTIVO es 'checkout_activo'", () => {
  assert.equal(CLAVE_CHECKOUT_ACTIVO, "checkout_activo");
});

test("interpretarCheckoutActivo devuelve true solo ante 'true' o true", () => {
  assert.equal(interpretarCheckoutActivo("true"), true);
  assert.equal(interpretarCheckoutActivo(true), true);
});

test("interpretarCheckoutActivo degrada a false ante cualquier otro valor", () => {
  assert.equal(interpretarCheckoutActivo("false"), false);
  assert.equal(interpretarCheckoutActivo(false), false);
  assert.equal(interpretarCheckoutActivo(null), false);
  assert.equal(interpretarCheckoutActivo(undefined), false);
  assert.equal(interpretarCheckoutActivo("1"), false);
  assert.equal(interpretarCheckoutActivo("si"), false);
  assert.equal(interpretarCheckoutActivo({}), false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/checkout-ajustes.test.ts`
  - Fallo esperado: funciones no exportadas en `app/lib/ajustes`.

- [ ] **Paso 3: Escribir la implementación (GREEN)**
  - Añadir al final de `app/lib/ajustes.ts`:
    ```ts
    /**
     * El interruptor del checkout, guardado en `app_settings` como texto plano.
     *
     * Solo la cadena exacta `"true"` (o el booleano `true`) lo abre: `"1"`, `"si"`
     * o `"True"` son verdaderos en JavaScript y no deben activar una compra.
     */
    export const CLAVE_CHECKOUT_ACTIVO = "checkout_activo";

    export function interpretarCheckoutActivo(valor: unknown): boolean {
      return valor === true || valor === "true";
    }
    ```
  - Añadir al final de `app/lib/ajustes.server.ts`:
    ```ts
    const leerCheckoutActivoConCache = unstable_cache(
      async (): Promise<boolean> => {
        const filas = await leer<{ valor: string }>(
          "select valor from app_settings where clave = $1",
          [CLAVE_CHECKOUT_ACTIVO],
        );
        return interpretarCheckoutActivo(filas[0]?.valor);
      },
      ["checkout-activo"],
      { tags: ["ajustes-checkout"], revalidate: SEGUNDOS_DE_CACHE },
    );

    /** Degradación segura: sin base, con la clave ausente o ante un fallo, `false`. */
    export async function obtenerCheckoutActivo(): Promise<boolean> {
      if (!process.env.DATABASE_URL) {
        return false;
      }
      try {
        return await leerCheckoutActivoConCache();
      } catch (error) {
        registrar("error", "ajustes-checkout-activo", {
          causa: error instanceof ErrorDeDatos ? error.causa : "desconocida",
        });
        return false;
      }
    }

    export async function guardarCheckoutActivo(activo: boolean, actorId: string): Promise<void> {
      await escribir(
        async (ejecutar) => {
          const anteriores = (await ejecutar(
            "select valor from app_settings where clave = $1 for update",
            [CLAVE_CHECKOUT_ACTIVO],
          )) as { valor: string }[];
          const anterior = anteriores[0] ? interpretarCheckoutActivo(anteriores[0].valor) : null;

          await ejecutar(
            `insert into app_settings (clave, valor, actualizado_en, actualizado_por)
             values ($1, $2, now(), $3)
             on conflict (clave) do update
               set valor = excluded.valor,
                   actualizado_en = now(),
                   actualizado_por = excluded.actualizado_por`,
            [CLAVE_CHECKOUT_ACTIVO, String(activo), actorId],
          );

          await ejecutar(
            `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
             values ('admin', $1, 'cambiar_checkout_activo', 'app_setting', $2, $3::jsonb, $4::jsonb)`,
            [
              actorId,
              CLAVE_CHECKOUT_ACTIVO,
              anterior !== null ? JSON.stringify({ activo: anterior }) : null,
              JSON.stringify({ activo }),
            ],
          );
        },
        { suceso: "guardar-checkout-activo" },
      );

      try {
        updateTag("ajustes-checkout");
      } catch (error) {
        registrar("error", "cache-checkout-no-invalidada", {
          clase: error instanceof Error ? error.constructor.name : "desconocida",
        });
      }
    }
    ```
  - Añadir `CLAVE_CHECKOUT_ACTIVO` e `interpretarCheckoutActivo` a la importación que `app/lib/ajustes.server.ts` ya hace de `./ajustes`.

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/checkout-ajustes.test.ts`

- [ ] **Paso 5: Registrar la prueba en `package.json` y verificar linters**
  - Añadir `tests/checkout-ajustes.test.ts` a `test:datos` en `package.json`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 1**
  - Mensaje: `feat(checkout): feature flag checkout_activo en app_settings con degradacion segura`

---

### Tarea 2: Saneamiento de redirección y retorno al checkout tras autenticación

**Files:**
- Crear: `app/cuenta/seguridadRedirigir.ts`
- Crear: `tests/cuenta-seguridad-redirigir.test.ts`
- Modificar: `app/cuenta/entrar/page.tsx`
- Modificar: `app/cuenta/ClienteFirebase.tsx`

**Interfaces:**
- En `app/cuenta/seguridadRedirigir.ts`:
  ```ts
  export const RUTAS_REDIRIGIR_PERMITIDAS = ["/checkout", "/carrito", "/cuenta"] as const;
  export function sanitizarRutaRedirigir(candidata: unknown): string;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/cuenta-seguridad-redirigir.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizarRutaRedirigir } from "../app/cuenta/seguridadRedirigir";

test("acepta rutas internas permitidas", () => {
  assert.equal(sanitizarRutaRedirigir("/checkout"), "/checkout");
  assert.equal(sanitizarRutaRedirigir("/carrito"), "/carrito");
  assert.equal(sanitizarRutaRedirigir("/cuenta"), "/cuenta");
});

test("rechaza rutas externas o no autorizadas y degrada a /cuenta", () => {
  assert.equal(sanitizarRutaRedirigir("https://malicioso.example"), "/cuenta");
  assert.equal(sanitizarRutaRedirigir("//malicioso.example"), "/cuenta");
  assert.equal(sanitizarRutaRedirigir("/admin"), "/cuenta");
  assert.equal(sanitizarRutaRedirigir("/checkout?x=1"), "/cuenta");
  assert.equal(sanitizarRutaRedirigir("/"), "/cuenta");
  assert.equal(sanitizarRutaRedirigir(null), "/cuenta");
  assert.equal(sanitizarRutaRedirigir(undefined), "/cuenta");
  assert.equal(sanitizarRutaRedirigir(123), "/cuenta");
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/cuenta-seguridad-redirigir.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/cuenta/seguridadRedirigir.ts
/**
 * Lista blanca cerrada, no una comprobación de forma.
 *
 * Aceptar «cualquier ruta que empiece por barra» deja pasar `//malicioso.example`,
 * que el navegador interpreta como protocolo relativo y lleva fuera del sitio.
 * Comparar contra una lista literal cierra esa puerta sin depender de expresiones
 * regulares que hay que revisar cada vez que alguien añade una ruta.
 */
export const RUTAS_REDIRIGIR_PERMITIDAS = ["/checkout", "/carrito", "/cuenta"] as const;
export type RutaRedirigirPermitida = (typeof RUTAS_REDIRIGIR_PERMITIDAS)[number];

export function sanitizarRutaRedirigir(candidata: unknown): string {
  if (typeof candidata === "string") {
    const limpia = candidata.trim();
    if ((RUTAS_REDIRIGIR_PERMITIDAS as readonly string[]).includes(limpia)) {
      return limpia;
    }
  }
  return "/cuenta";
}
```
  - En `app/cuenta/entrar/page.tsx`: leer `searchParams.redirigir`, pasarlo por `sanitizarRutaRedirigir` y entregar la ruta resultante al componente cliente `ClienteFirebase`.
  - En `app/cuenta/ClienteFirebase.tsx`: aceptar la propiedad `rutaDeRetorno` y, tras canjear la sesión con `POST /api/clientes/sesion`, navegar con `router.push(rutaDeRetorno)` en lugar de la ruta fija actual.

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/cuenta-seguridad-redirigir.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/cuenta-seguridad-redirigir.test.ts` a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 2**
  - Mensaje: `feat(auth): sanitizacion de ruta redirigir y retorno seguro al checkout tras autenticacion`

---
### Tarea 3: Migración 016 (tablas de pedidos, líneas, direcciones de pedido y revocaciones)

**Files:**
- Crear: `db/016_pedidos_y_solicitudes.sql`
- Crear: `tests/pedidos-migracion-016.test.ts`

**Interfaces:**
- DDL riguroso con claves foráneas reales, checks geográficos estrictos, checks de coherencia comercial y fiscal, `updated_at`, índices, siembra del interruptor y revocación al rol público. Las tres tablas y todas sus restricciones se escriben **una sola vez y de forma contigua** en `db/016_pedidos_y_solicitudes.sql`; el paso 3 contiene el archivo íntegro.
- Puntos que no se pueden negociar:
  - `orders.user_id bigint NOT NULL REFERENCES users(id)`, porque `users.id` es `bigserial` (`db/009_identidad_clientes.sql`).
  - `order_items.product_id text NOT NULL REFERENCES products(id)`, porque `products.id` es `text`.
  - La clave foránea geográfica de `order_addresses` es exactamente
    `FOREIGN KEY (municipio_codigo, departamento_codigo) REFERENCES geo_municipios(codigo, departamento_codigo)`,
    el mismo orden que ya usa `user_addresses_municipio_del_departamento` en `db/013_envios_tarifas.sql`.
  - El formato de referencia es exactamente
    `CONSTRAINT chk_orders_reference_format CHECK (reference ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$')`.
  - `shipping_cost_cents` y `total_cents` son `NULL` para Guatex —coste desconocido— y **nunca 0**.

- [ ] **Paso 1: Escribir la prueba estática y de aplicación reversible en rama aislada (RED)**

```ts
// tests/pedidos-migracion-016.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Client, neonConfig } from "@neondatabase/serverless";
import { endpointCanonico } from "../scripts/guarda-neon.mjs";

// El controlador habla por WebSocket; Node 22 en adelante trae uno nativo.
neonConfig.webSocketConstructor = globalThis.WebSocket;

const RUTA_SQL = path.resolve(process.cwd(), "db/016_pedidos_y_solicitudes.sql");
const TABLAS = ["orders", "order_items", "order_addresses"] as const;

test("el archivo db/016_pedidos_y_solicitudes.sql existe y contiene el DDL estricto", () => {
  assert.equal(fs.existsSync(RUTA_SQL), true, "La migración 016 debe existir");

  const sql = fs.readFileSync(RUTA_SQL, "utf8");

  // orders
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?orders/i);
  assert.match(sql, /reference\s+text\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(sql, /user_id\s+bigint\s+NOT\s+NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)/i);
  assert.match(sql, /subtotal_cents\s+integer\s+NOT\s+NULL\s+CHECK\s*\(\s*subtotal_cents\s*>=\s*0\s*\)/i);
  assert.match(sql, /updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_reference_format\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_status\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_shipping_method\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_coherencia_costes\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_coherencia_status\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_fiscal_verificado\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+chk_orders_fiscal_numero\s+CHECK/i);
  assert.match(sql, /CONSTRAINT\s+orders_user_idempotency_unique\s+UNIQUE\s*\(\s*user_id\s*,\s*idempotency_key\s*\)/i);

  // El patrón exacto de la referencia, carácter a carácter.
  assert.ok(
    sql.includes("reference ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'"),
    "El check de formato de referencia debe estar completo y sin truncar",
  );

  // order_items
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?order_items/i);
  assert.match(sql, /product_id\s+text\s+NOT\s+NULL\s+REFERENCES\s+products\s*\(\s*id\s*\)/i);
  assert.match(sql, /quantity\s+integer\s+NOT\s+NULL\s+CHECK\s*\(\s*quantity\s*>\s*0\s*\)/i);
  assert.match(sql, /unit_price_cents\s+integer\s+NOT\s+NULL\s+CHECK\s*\(\s*unit_price_cents\s*>\s*0\s*\)/i);

  // order_addresses
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?order_addresses/i);
  assert.match(sql, /departamento_codigo\s+char\(2\)\s+NOT\s+NULL\s+REFERENCES\s+geo_departamentos\s*\(\s*codigo\s*\)/i);
  assert.match(sql, /municipio_codigo\s+char\(4\)\s+NOT\s+NULL/i);
  assert.match(
    sql,
    /FOREIGN\s+KEY\s*\(\s*municipio_codigo\s*,\s*departamento_codigo\s*\)\s*REFERENCES\s+geo_municipios\s*\(\s*codigo\s*,\s*departamento_codigo\s*\)/i,
    "La clave foránea geográfica debe ser compuesta y en el orden (municipio, departamento)",
  );
  assert.match(sql, /CONSTRAINT\s+chk_order_addresses_zona_capitalina\s+CHECK/i);

  // Índices, siembra y seguridad
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_orders_user_created/i);
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_orders_status/i);
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_order_items_order_id/i);
  assert.match(sql, /INSERT\s+INTO\s+app_settings\s*\(\s*clave\s*,\s*valor\s*\)\s*VALUES\s*\(\s*'checkout_activo'\s*,\s*'false'\s*\)/i);
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+TABLE\s+orders\s*,\s*order_items\s*,\s*order_addresses\s+FROM\s+econoluz_publico/i);

  // Prohibición explícita del orden invertido de la clave foránea geográfica y de
  // cualquier referencia a columnas que no existen en `geo_municipios`.
  assert.doesNotMatch(
    sql,
    /FOREIGN\s+KEY\s*\(\s*departamento_codigo\s*,\s*municipio_codigo\s*\)/i,
    "El orden de la clave foránea compuesta no puede estar invertido",
  );
  assert.doesNotMatch(
    sql,
    /REFERENCES\s+geo_municipios\s*\(\s*departamento\s*,/i,
    "geo_municipios no tiene ninguna columna llamada «departamento»",
  );
});

test("aplica el DDL en una transacción y lo revierte siempre, contra una rama aislada identificada positivamente", async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "Falta DATABASE_URL: la prueba de migración 016 necesita una rama de Neon aislada de desarrollo o E2E.",
    );
  }

  const ramaEsperada = process.env.NEON_RAMA_E2E;
  const endpointProduccion = process.env.NEON_ENDPOINT_PRODUCCION;
  if (!ramaEsperada || !endpointProduccion) {
    throw new Error(
      "Faltan NEON_RAMA_E2E o NEON_ENDPOINT_PRODUCCION: sin ellas no se puede identificar positivamente la rama.",
    );
  }

  // Rechazo terminante de Producción. `endpointCanonico` normaliza el sufijo
  // «-pooler», así que la comparación no se puede esquivar cambiando de endpoint
  // de conexión dentro del mismo proyecto.
  const hostConectado = endpointCanonico(new URL(dbUrl).hostname);
  if (hostConectado === endpointCanonico(endpointProduccion)) {
    throw new Error(`Escritura rechazada: el endpoint ${hostConectado} pertenece a Producción.`);
  }

  const cliente = new Client({ connectionString: dbUrl });
  await cliente.connect();

  try {
    // Identificación POSITIVA de la rama: no basta con «no es Producción».
    // El marcador lo escribe `scripts/guarda-neon.mjs --sellar`.
    const { rows: marcador } = await cliente.query(
      "select valor from app_settings where clave = 'rama_neon'",
    );
    assert.equal(
      marcador[0]?.valor,
      ramaEsperada,
      `La base dice ser la rama «${marcador[0]?.valor ?? "sin marcar"}», y se esperaba «${ramaEsperada}».`,
    );

    // Fotografía previa: qué tablas de las tres ya existían antes de la prueba.
    const { rows: previas } = await cliente.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = any($1)`,
      [[...TABLAS]],
    );
    const existentesAntes = new Set(previas.map((f) => String(f.table_name)));

    const sqlContenido = fs.readFileSync(RUTA_SQL, "utf8");

    try {
      await cliente.query("BEGIN");
      await cliente.query(sqlContenido);

      const { rows: dentro } = await cliente.query(
        `select table_name from information_schema.tables
          where table_schema = 'public' and table_name = any($1)`,
        [[...TABLAS]],
      );
      assert.equal(dentro.length, 3, "Las tres tablas deben existir dentro de la transacción");

      // El patrón de referencia se evalúa directamente, sin necesidad de filas.
      const { rows: patron } = await cliente.query(
        `select
           'EC-2K7M9P4XBW' ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$' as valida,
           'EC-0123456789' ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$' as ambigua,
           'EC-23456789ABC' ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$' as larga`,
      );
      assert.equal(patron[0].valida, true);
      assert.equal(patron[0].ambigua, false, "Los caracteres 0 y 1 no pertenecen al alfabeto");
      assert.equal(patron[0].larga, false, "Once caracteres tampoco valen");

      // La clave foránea geográfica apunta a geo_municipios por (codigo, departamento_codigo).
      const { rows: fk } = await cliente.query(
        `select pg_get_constraintdef(c.oid) as definicion
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
          where t.relname = 'order_addresses' and c.contype = 'f'
            and pg_get_constraintdef(c.oid) like '%geo_municipios%'`,
      );
      assert.equal(fk.length, 1, "Debe existir una sola clave foránea hacia geo_municipios");
      assert.match(
        String(fk[0].definicion),
        /FOREIGN KEY \(municipio_codigo, departamento_codigo\) REFERENCES geo_municipios\(codigo, departamento_codigo\)/i,
      );

      // Unicidad compuesta de idempotencia.
      const { rows: unico } = await cliente.query(
        `select 1 from pg_constraint where conname = 'orders_user_idempotency_unique'`,
      );
      assert.equal(unico.length, 1, "Debe existir la restricción única (user_id, idempotency_key)");

      // El interruptor nace apagado.
      const { rows: bandera } = await cliente.query(
        "select valor from app_settings where clave = 'checkout_activo'",
      );
      assert.equal(bandera[0]?.valor, "false", "checkout_activo debe nacer en 'false'");
    } finally {
      // Garantía de reversión absoluta: SIEMPRE se deshace, pase lo que pase.
      await cliente.query("ROLLBACK");
    }

    // Después del ROLLBACK, el conjunto de tablas tiene que ser exactamente el
    // de antes. Comparar contra la fotografía previa —y no contra cero— es lo
    // que distingue una tabla preexistente de un residuo de esta prueba.
    const { rows: despues } = await cliente.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = any($1)`,
      [[...TABLAS]],
    );
    const existentesDespues = new Set(despues.map((f) => String(f.table_name)));
    assert.deepEqual(
      [...existentesDespues].sort(),
      [...existentesAntes].sort(),
      "La prueba no puede dejar ninguna tabla creada fuera de la transacción",
    );
  } finally {
    await cliente.end();
  }
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-migracion-016.test.ts`
  - Fallo esperado: `db/016_pedidos_y_solicitudes.sql` no existe.

- [ ] **Paso 3: Escribir la migración SQL completa (GREEN)**

```sql
-- db/016_pedidos_y_solicitudes.sql
--
-- Subproyecto 6: pedidos de mensajero propio y solicitudes de Guatex.
--
-- Los invariantes viven aquí, en el esquema, y no en TypeScript: una regla escrita solo en
-- la aplicación se salta con un script, con una consola de Postgres o con el próximo camino
-- que alguien añada sin acordarse de ella.
--
-- Depende de `009_identidad_clientes.sql` (`users`), `002_products.sql` (`products`),
-- `007_app_settings.sql` (`app_settings`) y `012_geografia_gt.sql` (`geo_departamentos`
-- y `geo_municipios`).
--
-- Aditiva, transaccional y repetible. Las tres tablas nacen vacías y el checkout nace
-- apagado.

CREATE TABLE IF NOT EXISTS orders (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- La referencia pública que ve el cliente. NUNCA sirve como autorización: toda
  -- consulta filtra además por `user_id`.
  reference           text        NOT NULL UNIQUE,
  -- `users.id` es `bigserial`, así que aquí es `bigint`. No hay pedido sin cuenta.
  user_id             bigint      NOT NULL REFERENCES users(id),
  status              text        NOT NULL,
  shipping_method     text        NOT NULL,
  -- Para Guatex el flete es desconocido y se guarda como NULL. Cero significaría
  -- «envío gratuito», que es una promesa distinta y falsa.
  shipping_cost_cents integer,
  subtotal_cents      integer     NOT NULL CHECK (subtotal_cents >= 0),
  total_cents         integer,
  fiscal_tipo         text        NOT NULL CHECK (fiscal_tipo IN ('cf', 'nit', 'cui')),
  fiscal_numero       text,
  fiscal_nombre       text        NOT NULL,
  fiscal_verificado   boolean     NOT NULL DEFAULT false,
  idempotency_key     text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_orders_reference_format
    CHECK (reference ~ '^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'),

  CONSTRAINT chk_orders_status
    CHECK (status IN ('pendiente_de_pago', 'pendiente_de_contacto', 'contactado', 'cerrado', 'cancelado')),

  CONSTRAINT chk_orders_shipping_method
    CHECK (shipping_method IN ('mensajero_propio', 'guatex')),

  -- Guatex: coste y total desconocidos. Mensajero propio: los dos conocidos, no
  -- negativos y cuadrando con el subtotal.
  CONSTRAINT chk_orders_coherencia_costes
    CHECK (
      (shipping_method = 'guatex'
        AND shipping_cost_cents IS NULL
        AND total_cents IS NULL)
      OR
      (shipping_method = 'mensajero_propio'
        AND shipping_cost_cents IS NOT NULL AND shipping_cost_cents >= 0
        AND total_cents IS NOT NULL AND total_cents >= 0
        AND total_cents = subtotal_cents + shipping_cost_cents)
    ),

  -- Un pedido de mensajero propio no puede nacer «pendiente de contacto», ni una
  -- solicitud de Guatex «pendiente de pago».
  CONSTRAINT chk_orders_coherencia_status
    CHECK (
      (shipping_method = 'mensajero_propio'
        AND status IN ('pendiente_de_pago', 'cerrado', 'cancelado'))
      OR
      (shipping_method = 'guatex'
        AND status IN ('pendiente_de_contacto', 'contactado', 'cerrado', 'cancelado'))
    ),

  -- El único caso legítimo de fiscalidad sin verificar es Guatex con Consumidor Final,
  -- que es justo el que el panel tiene que resolver por WhatsApp.
  CONSTRAINT chk_orders_fiscal_verificado
    CHECK (
      fiscal_verificado = true
      OR (fiscal_verificado = false AND shipping_method = 'guatex' AND fiscal_tipo = 'cf')
    ),

  -- Consumidor Final no lleva número; NIT y CUI sí.
  CONSTRAINT chk_orders_fiscal_numero
    CHECK (
      (fiscal_tipo = 'cf' AND fiscal_numero IS NULL)
      OR
      (fiscal_tipo <> 'cf' AND fiscal_numero IS NOT NULL AND length(btrim(fiscal_numero)) >= 2)
    ),

  -- La idempotencia es por cliente, no global: dos clientes pueden generar la misma
  -- clave sin estorbarse, y un reintento del mismo cliente nunca duplica el pedido.
  CONSTRAINT orders_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- `products.id` es `text`; ver `db/002_products.sql`.
  product_id         text        NOT NULL REFERENCES products(id),
  quantity           integer     NOT NULL CHECK (quantity > 0),
  unit_price_cents   integer     NOT NULL CHECK (unit_price_cents > 0),
  -- Instantánea: un pedido antiguo tiene que poder explicarse aunque el catálogo
  -- cambie de nombre o de precio después.
  snapshot_reference text        NOT NULL,
  snapshot_title     text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_addresses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  recipient_name      text        NOT NULL,
  phone               text        NOT NULL,
  departamento_codigo char(2)     NOT NULL REFERENCES geo_departamentos(codigo),
  municipio_codigo    char(4)     NOT NULL,
  zona_capitalina     integer,
  line1               text        NOT NULL,
  references_note     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Dos claves foráneas sueltas probarían que cada código existe, no que el municipio
  -- sea de ese departamento. La compuesta sí, y va en el mismo orden que la de
  -- `user_addresses` en `013_envios_tarifas.sql`.
  FOREIGN KEY (municipio_codigo, departamento_codigo)
    REFERENCES geo_municipios(codigo, departamento_codigo),

  -- Las 22 zonas capitalinas válidas: 1-19, 21, 24 y 25. Fuera del municipio de
  -- Guatemala la zona tiene que ser nula.
  CONSTRAINT chk_order_addresses_zona_capitalina
    CHECK (
      (municipio_codigo = '0101'
        AND zona_capitalina IS NOT NULL
        AND zona_capitalina IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,24,25))
      OR
      (municipio_codigo <> '0101' AND zona_capitalina IS NULL)
    )
);

-- ---------------------------------------------------------------------------
-- `updated_at` se mantiene solo, como en `002_products.sql` y `013_envios_tarifas.sql`
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION orders_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_touch_updated_at ON orders;
CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_touch_updated_at();

DROP TRIGGER IF EXISTS order_addresses_touch_updated_at ON order_addresses;
CREATE TRIGGER order_addresses_touch_updated_at
  BEFORE UPDATE ON order_addresses
  FOR EACH ROW EXECUTE FUNCTION orders_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Índices de las tres consultas previstas
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
-- `order_items.product_id` es una clave foránea y Postgres no indexa el lado hijo.
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

-- ---------------------------------------------------------------------------
-- El checkout nace apagado
-- ---------------------------------------------------------------------------
--
-- `on conflict do nothing` mantiene la migración repetible sin pisar un valor que
-- alguien haya cambiado después a propósito, igual que en `007_app_settings.sql`.

INSERT INTO app_settings (clave, valor)
VALUES ('checkout_activo', 'false')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- El rol público no ve nada de esto
-- ---------------------------------------------------------------------------
--
-- Se revoca de forma explícita en vez de confiar en no haber concedido nada: una
-- concesión futura por descuido pasaría inadvertida. La aplicación escribe con la
-- conexión de `DATABASE_URL`, que es la propietaria de estas tablas y no necesita
-- ninguna concesión adicional.

REVOKE ALL ON TABLE orders, order_items, order_addresses FROM econoluz_publico;
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-migracion-016.test.ts`
  - Requisitos de entorno: `DATABASE_URL` apuntando a la rama E2E de Neon, `NEON_RAMA_E2E` con el nombre sellado de esa rama y `NEON_ENDPOINT_PRODUCCION` con el endpoint de Producción.

- [ ] **Paso 5: Aplicar la migración en la rama aislada y registrar la prueba**
  - Simular primero: `npm run db:migrar -- --simular`.
  - Aplicar en desarrollo: `npm run db:migrar -- --aplicar`.
  - Añadir `tests/pedidos-migracion-016.test.ts` a `test:datos` en `package.json`.
  - Ejecutar: `npm run test:datos && npm run typecheck && npm run lint`.

- [ ] **Paso 6: Commit de la tarea 3**
  - Mensaje: `feat(db): migracion 016 de tablas de pedidos, direcciones e idempotencia`

---
### Tarea 4: Generador de referencias públicas con formato no ambiguo `EC-2K7M9P4XBW`

**Files:**
- Crear: `app/pedidos/referencia.ts`
- Crear: `tests/pedidos-referencia.test.ts`

**Interfaces:**
- En `app/pedidos/referencia.ts`:
  ```ts
  export const ALFABETO_REFERENCIA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 caracteres (sin 0, 1, I, O)
  export const LONGITUD_ALEATORIA_REFERENCIA = 10;
  export const PREFIJO_REFERENCIA = "EC-";
  export function generarReferenciaPedido(): string;
  export function esReferenciaValida(referencia: unknown): boolean;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/pedidos-referencia.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  generarReferenciaPedido,
  esReferenciaValida,
  ALFABETO_REFERENCIA,
} from "../app/pedidos/referencia";

test("alfabeto no ambiguo tiene exactamente 32 caracteres y excluye 0, 1, I y O", () => {
  assert.equal(ALFABETO_REFERENCIA.length, 32);
  assert.equal(ALFABETO_REFERENCIA.includes("0"), false);
  assert.equal(ALFABETO_REFERENCIA.includes("1"), false);
  assert.equal(ALFABETO_REFERENCIA.includes("I"), false);
  assert.equal(ALFABETO_REFERENCIA.includes("O"), false);
});

test("genera referencias con prefijo EC- seguido de 10 caracteres no ambiguos", () => {
  const ref = generarReferenciaPedido();
  assert.equal(ref.length, 13);
  assert.match(ref, /^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
});

test("genera referencias distintas en una muestra amplia", () => {
  const refs = new Set<string>();
  for (let i = 0; i < 200; i++) {
    refs.add(generarReferenciaPedido());
  }
  assert.equal(refs.size, 200);
});

test("valida referencias correctas e incorrectas", () => {
  assert.equal(esReferenciaValida("EC-2K7M9P4XBW"), true);
  assert.equal(esReferenciaValida("EC-XXXXXXXXXX"), true);

  // Minúsculas rechazadas
  assert.equal(esReferenciaValida("EC-2k7m9p4xbw"), false);
  // Caracteres ambiguos prohibidos
  assert.equal(esReferenciaValida("EC-0123456789"), false);
  assert.equal(esReferenciaValida("EC-ABCDEFGHIJ"), false); // Contiene I
  assert.equal(esReferenciaValida("EC-ABCDEFGHJO"), false); // Contiene O
  // Longitud incorrecta
  assert.equal(esReferenciaValida("EC-2K7M9"), false);
  assert.equal(esReferenciaValida("EC-2K7M9P4XBWZ"), false);
  // Prefijo incorrecto
  assert.equal(esReferenciaValida("PED-2K7M9P4XBW"), false);
  assert.equal(esReferenciaValida(null), false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-referencia.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/pedidos/referencia.ts
import { randomBytes } from "node:crypto";

/**
 * Alfabeto tipo Crockford Base32: 32 caracteres sin `0`, `1`, `I` ni `O`.
 *
 * La referencia se dicta por teléfono y se copia a mano en WhatsApp, así que la
 * confusión entre cero y O, o entre uno e I, no es teórica.
 */
export const ALFABETO_REFERENCIA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const LONGITUD_ALEATORIA_REFERENCIA = 10;
export const PREFIJO_REFERENCIA = "EC-";

const REGEX_REFERENCIA = new RegExp(
  `^${PREFIJO_REFERENCIA}[${ALFABETO_REFERENCIA}]{${LONGITUD_ALEATORIA_REFERENCIA}}$`,
);

export function generarReferenciaPedido(): string {
  const bytes = randomBytes(LONGITUD_ALEATORIA_REFERENCIA);
  let aleatorio = "";
  // 32 es potencia de dos (2^5) y 256 es múltiplo de 32, así que `byte & 31`
  // reparte los 256 valores posibles en 32 grupos de 8: distribución uniforme
  // exacta, sin el sesgo que introduciría un módulo sobre un alfabeto que no
  // dividiera a 256.
  for (let i = 0; i < LONGITUD_ALEATORIA_REFERENCIA; i++) {
    aleatorio += ALFABETO_REFERENCIA[bytes[i] & 31];
  }
  return `${PREFIJO_REFERENCIA}${aleatorio}`;
}

export function esReferenciaValida(referencia: unknown): boolean {
  return typeof referencia === "string" && REGEX_REFERENCIA.test(referencia);
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-referencia.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-referencia.test.ts` a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 4**
  - Mensaje: `feat(pedidos): generador de referencias publicas no ambiguas con prefijo EC-`

---

### Tarea 5: Tipos de dominio, DTO de dirección guardada y contratos (`app/pedidos/contratos.ts`)

**Files:**
- Crear: `app/pedidos/contratos.ts`
- Crear: `tests/pedidos-contratos.test.ts`

**Interfaces:** las declara el propio módulo; el paso 3 contiene el archivo íntegro, incluidos `DireccionGuardadaDto` y su adaptador `aDireccionGuardadaDto`, que es lo que permite que la página de checkout **no toque nunca propiedades de un `Record<string, unknown>`** devuelto por `listarDirecciones`.

- [ ] **Paso 1: Escribir la prueba unitaria de contratos (RED)**

```ts
// tests/pedidos-contratos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as contratos from "../app/pedidos/contratos";

test("los contratos de pedidos exportan valores y constantes en tiempo de ejecución", () => {
  assert.ok(Array.isArray(contratos.ESTADOS_PEDIDO_VALIDOS));
  assert.equal(contratos.ESTADOS_PEDIDO_VALIDOS.length, 5);
  assert.deepEqual(
    [...contratos.ESTADOS_PEDIDO_VALIDOS],
    ["pendiente_de_pago", "pendiente_de_contacto", "contactado", "cerrado", "cancelado"],
  );

  const pedidoCreado: contratos.PedidoCreado = {
    orderId: "ord-1",
    reference: "EC-2K7M9P4XBW",
    status: "pendiente_de_contacto",
    shippingMethod: "guatex",
    shippingCostCents: null,
    subtotalCents: 10000,
    totalCents: null,
    itemsCount: 1,
  };
  assert.equal(pedidoCreado.reference, "EC-2K7M9P4XBW");
  assert.equal(pedidoCreado.shippingMethod, "guatex");

  const paramsCheckout: contratos.ParametrosCheckout = {
    clienteId: "42",
    idempotencyKey: "3f8b1c2d-4e5a-4b6c-8d9e-0a1b2c3d4e5f",
    checkoutActivo: true,
    datosFiscales: { tipo: "cf", nombre: "Consumidor Final" },
    direccion: {
      destinatario: "Juan",
      telefono: "12345678",
      departamentoCodigo: "01",
      municipioCodigo: "0101",
      zonaCapitalina: 10,
      linea1: "Calle 1",
      referencias: null,
    },
  };
  assert.equal(paramsCheckout.clienteId, "42");
  assert.equal("metodoEnvio" in paramsCheckout, false, "ParametrosCheckout no debe incluir metodoEnvio");
});

test("aDireccionGuardadaDto traduce una fila cruda sin tocar propiedades unknown fuera del adaptador", () => {
  const dto = contratos.aDireccionGuardadaDto({
    id: 17,
    destinatario: "  Ana Pérez  ",
    departamento: "Guatemala",
    municipio: "Guatemala",
    direccion: " Avenida Reforma 1-00 ",
    departamento_codigo: "01",
    municipio_codigo: "0101",
    zona_capitalina: 14,
    telefono: " 55554444 ",
    referencias: "  Portón verde  ",
  });

  assert.equal(dto.id, "17");
  assert.equal(dto.destinatario, "Ana Pérez");
  assert.equal(dto.direccion, "Avenida Reforma 1-00");
  assert.equal(dto.departamentoCodigo, "01");
  assert.equal(dto.municipioCodigo, "0101");
  assert.equal(dto.zonaCapitalina, 14);
  assert.equal(dto.telefono, "55554444");
  assert.equal(dto.referencias, "Portón verde");
});

test("aDireccionGuardadaDto degrada a null lo ausente y no inventa ceros", () => {
  const dto = contratos.aDireccionGuardadaDto({
    id: 18,
    destinatario: "Carlos",
    departamento: "Guatemala",
    municipio: "Mixco",
    direccion: "Km 15",
    departamento_codigo: "01",
    municipio_codigo: "0108",
    zona_capitalina: null,
    telefono: "55551122",
    referencias: null,
  });

  assert.equal(dto.zonaCapitalina, null);
  assert.equal(dto.referencias, null);

  const vacio = contratos.aDireccionGuardadaDto({});
  assert.equal(vacio.id, "");
  assert.equal(vacio.departamentoCodigo, null);
  assert.equal(vacio.municipioCodigo, null);
  assert.equal(vacio.zonaCapitalina, null);
});

```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-contratos.test.ts`

- [ ] **Paso 3: Escribir la implementación completa (GREEN)**

```ts
// app/pedidos/contratos.ts
export const ESTADOS_PEDIDO_VALIDOS = [
  "pendiente_de_pago",
  "pendiente_de_contacto",
  "contactado",
  "cerrado",
  "cancelado",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO_VALIDOS)[number];

export type MetodoEnvio = "mensajero_propio" | "guatex";

export type TipoIdentificacionFiscal = "cf" | "nit" | "cui";

export type DatosFiscalesPedido = {
  tipo: TipoIdentificacionFiscal;
  numero?: string | null;
  nombre: string;
  verificado?: boolean;
};

/**
 * La dirección guardada tal y como la consume la interfaz.
 *
 * `listarDirecciones` devuelve `Record<string, unknown>[]`, y leer esas propiedades
 * sueltas en una página de servidor es justo lo que acaba pintando `undefined` en
 * pantalla o rompiendo el render. El adaptador es el único sitio del proyecto que
 * toca esas claves crudas.
 *
 * `id` viaja como texto porque `user_addresses.id` es `bigserial` y un entero de
 * 64 bits no cabe con garantías en un `number` de JavaScript.
 */
export type DireccionGuardadaDto = {
  id: string;
  destinatario: string;
  departamento: string;
  municipio: string;
  direccion: string;
  departamentoCodigo: string | null;
  municipioCodigo: string | null;
  zonaCapitalina: number | null;
  telefono: string;
  referencias: string | null;
};

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : valor === null || valor === undefined ? "" : String(valor).trim();
}

function textoOpcionalDe(valor: unknown): string | null {
  const texto = textoDe(valor);
  return texto === "" ? null : texto;
}

function zonaDe(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isInteger(valor)) return valor;
  if (typeof valor === "string" && /^[0-9]+$/.test(valor.trim())) return Number(valor.trim());
  return null;
}

export function aDireccionGuardadaDto(fila: Record<string, unknown>): DireccionGuardadaDto {
  return {
    id: textoDe(fila.id),
    destinatario: textoDe(fila.destinatario),
    departamento: textoDe(fila.departamento),
    municipio: textoDe(fila.municipio),
    direccion: textoDe(fila.direccion),
    departamentoCodigo: textoOpcionalDe(fila.departamento_codigo),
    municipioCodigo: textoOpcionalDe(fila.municipio_codigo),
    zonaCapitalina: zonaDe(fila.zona_capitalina),
    telefono: textoDe(fila.telefono),
    referencias: textoOpcionalDe(fila.referencias),
  };
}

export type DireccionPedidoInput = {
  destinatario: string;
  telefono: string;
  departamentoCodigo: string;
  municipioCodigo: string;
  zonaCapitalina: number | null;
  linea1: string;
  referencias: string | null;
};

/**
 * `direccion` es `null` cuando el cliente reutiliza una dirección guardada: la
 * definitiva la resuelve el orquestador leyéndola de `user_addresses` con el filtro
 * por `user_id`. Rellenarla con cadenas vacías para «tener algo» escondería el caso
 * en el que faltan las dos.
 */
export type ParametrosCheckout = {
  clienteId: string;
  idempotencyKey: string;
  checkoutActivo: boolean;
  datosFiscales: DatosFiscalesPedido;
  direccion: DireccionPedidoInput | null;
  direccionGuardadaId?: string;
};

export type ParametrosCreacionPedido = {
  userId: string;
  idempotencyKey: string;
  fiscal: DatosFiscalesPedido;
  direccion: DireccionPedidoInput;
};

export type PedidoCreado = {
  orderId: string;
  reference: string;
  status: EstadoPedido;
  shippingMethod: MetodoEnvio;
  shippingCostCents: number | null;
  subtotalCents: number;
  totalCents: number | null;
  itemsCount: number;
};

export type ResultadoCrearPedido =
  | { ok: true; pedido: PedidoCreado }
  | { ok: false; codigo: "PAGO_NO_DISPONIBLE"; error: string };

export type LineaPedidoDetalle = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  snapshotReference: string;
  snapshotTitle: string;
};

export type PedidoConDetalle = {
  id: string;
  reference: string;
  userId: string;
  status: EstadoPedido;
  shippingMethod: MetodoEnvio;
  shippingCostCents: number | null;
  subtotalCents: number;
  totalCents: number | null;
  fiscal: {
    tipo: TipoIdentificacionFiscal;
    numero: string | null;
    nombre: string;
    verificado: boolean;
  };
  direccion: {
    destinatario: string;
    telefono: string;
    departamentoCodigo: string;
    municipioCodigo: string;
    zonaCapitalina: number | null;
    linea1: string;
    referencias: string | null;
  };
  items: readonly LineaPedidoDetalle[];
  createdAt: Date;
  updatedAt: Date;
};

export type ResultadoCheckout =
  | {
      ok: true;
      reference: string;
      status: EstadoPedido;
      metodoEnvio: MetodoEnvio;
      urlPago?: string | null;
    }
  | {
      ok: false;
      error: string;
      recuperable?: boolean;
      reference?: string;
    };
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-contratos.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-contratos.test.ts` a `test:datos`.
  - Ejecutar: `npm run test:datos && npm run typecheck && npm run lint`.

- [ ] **Paso 6: Commit de la tarea 5**
  - Mensaje: `feat(pedidos): contratos de dominio, estados y dto de direccion guardada`

---

### Tarea 6: Máquina de estados pura para pedidos y solicitudes

**Files:**
- Crear: `app/pedidos/estados.ts`
- Crear: `tests/pedidos-estados.test.ts`

**Interfaces:**
- En `app/pedidos/estados.ts`:
  ```ts
  export function puedeTransicionarPedido(params: {
    metodo: MetodoEnvio;
    actual: EstadoPedido;
    siguiente: EstadoPedido;
    fiscalVerificado: boolean;
  }): boolean;
  ```
  `EstadoPedido` y `MetodoEnvio` se importan de `./contratos`: no se redeclaran aquí, porque dos definiciones del mismo estado acaban divergiendo.

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/pedidos-estados.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { puedeTransicionarPedido } from "../app/pedidos/estados";

test("Guatex permite las transiciones previstas", () => {
  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "pendiente_de_contacto", siguiente: "contactado", fiscalVerificado: false,
  }), true);

  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "pendiente_de_contacto", siguiente: "cancelado", fiscalVerificado: false,
  }), true);

  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "contactado", siguiente: "cerrado", fiscalVerificado: true,
  }), true);

  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "contactado", siguiente: "cancelado", fiscalVerificado: false,
  }), true);
});

test("Guatex no cierra una solicitud con la fiscalidad sin verificar", () => {
  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "contactado", siguiente: "cerrado", fiscalVerificado: false,
  }), false);
});

test("Guatex no salta de pendiente_de_contacto a cerrado", () => {
  assert.equal(puedeTransicionarPedido({
    metodo: "guatex", actual: "pendiente_de_contacto", siguiente: "cerrado", fiscalVerificado: true,
  }), false);
});

test("mensajero propio no puede cerrarse manualmente como si estuviera pagado", () => {
  assert.equal(puedeTransicionarPedido({
    metodo: "mensajero_propio", actual: "pendiente_de_pago", siguiente: "cerrado", fiscalVerificado: true,
  }), false);

  assert.equal(puedeTransicionarPedido({
    metodo: "mensajero_propio", actual: "pendiente_de_pago", siguiente: "cancelado", fiscalVerificado: false,
  }), true);
});

test("los estados terminales no admiten ninguna salida", () => {
  for (const metodo of ["guatex", "mensajero_propio"] as const) {
    for (const actual of ["cerrado", "cancelado"] as const) {
      assert.equal(puedeTransicionarPedido({
        metodo, actual, siguiente: "contactado", fiscalVerificado: true,
      }), false);
    }
  }
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-estados.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/pedidos/estados.ts
import type { EstadoPedido, MetodoEnvio } from "./contratos";

/**
 * Máquina de estados cerrada: lo que no está escrito aquí, no se puede hacer.
 *
 * `cerrado` desde `contactado` exige `fiscal_verificado`, porque cerrar una
 * solicitud de Guatex con Consumidor Final sin comprobar el importe final es
 * exactamente lo que la SAT no permite por encima de Q2.500.
 *
 * Mensajero propio se queda en `pendiente_de_pago` hasta que el subproyecto 7
 * traiga la pasarela: marcarlo «cerrado» a mano sería afirmar que se cobró.
 */
export function puedeTransicionarPedido(params: {
  metodo: MetodoEnvio;
  actual: EstadoPedido;
  siguiente: EstadoPedido;
  fiscalVerificado: boolean;
}): boolean {
  const { metodo, actual, siguiente, fiscalVerificado } = params;

  if (metodo === "guatex") {
    if (actual === "pendiente_de_contacto") {
      return siguiente === "contactado" || siguiente === "cancelado";
    }
    if (actual === "contactado") {
      if (siguiente === "cerrado") return fiscalVerificado === true;
      return siguiente === "cancelado";
    }
    return false;
  }

  if (actual === "pendiente_de_pago") {
    return siguiente === "cancelado";
  }
  return false;
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-estados.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-estados.test.ts` a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 6**
  - Mensaje: `feat(pedidos): maquina de estados pura para transiciones y verificacion fiscal`

---

### Tarea 7: Validación fiscal pura (SAT Guatemala) con umbral legal de Q2.500

**Files:**
- Crear: `app/pedidos/fiscal.ts`
- Crear: `tests/pedidos-fiscal.test.ts`

**Interfaces:**
- En `app/pedidos/fiscal.ts`:
  ```ts
  export const UMBRAL_FISCAL_SAT_CENTS = 250000;
  export type DatosFiscalesInput = {
    tipo: TipoIdentificacionFiscal;
    numero?: string | null;
    nombre: string;
  };
  export type ResultadoValidacionFiscal =
    | { ok: true; tipo: TipoIdentificacionFiscal; numero: string | null; nombre: string; verificado: boolean }
    | { ok: false; error: string };
  export function normalizarNit(nit: string): string;
  export function validarDatosFiscales(params: {
    totalOsubtotalCents: number;
    datos: DatosFiscalesInput;
    esGuatex: boolean;
  }): ResultadoValidacionFiscal;
  ```
  El resultado correcto se consume **por sus propiedades planas** (`tipo`, `numero`, `nombre`, `verificado`) después de estrechar por `ok`. No hay ninguna propiedad `datos` en el resultado.

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/pedidos-fiscal.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { validarDatosFiscales, normalizarNit, UMBRAL_FISCAL_SAT_CENTS } from "../app/pedidos/fiscal";

test("la constante del umbral legal SAT es 250000 centavos (Q2.500)", () => {
  assert.equal(UMBRAL_FISCAL_SAT_CENTS, 250000);
});

test("rechaza importes monetarios inválidos (negativos, no enteros o no finitos)", () => {
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: -1, datos: { tipo: "cf", nombre: "A" }, esGuatex: false }).ok, false);
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: 2500.5, datos: { tipo: "cf", nombre: "A" }, esGuatex: false }).ok, false);
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: Number.NaN, datos: { tipo: "cf", nombre: "A" }, esGuatex: false }).ok, false);
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: Number.POSITIVE_INFINITY, datos: { tipo: "cf", nombre: "A" }, esGuatex: false }).ok, false);
});

test("total menor a Q2.500 admite CF y lo devuelve sin número", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 249999,
    datos: { tipo: "cf", nombre: "Consumidor Final" },
    esGuatex: false,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.tipo, "cf");
    assert.equal(res.numero, null);
    assert.equal(res.verificado, true);
  }
});

test("total igual a Q2.500 rechaza CF: el umbral es inclusivo", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 250000,
    datos: { tipo: "cf", nombre: "Consumidor Final" },
    esGuatex: false,
  });
  assert.equal(res.ok, false);
});

test("caso real Q2.480 de productos + Q35 de envío = Q2.515 rechaza CF", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 251500,
    datos: { tipo: "cf", nombre: "Consumidor Final" },
    esGuatex: false,
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /Q2\.500/);
    assert.match(res.error, /NIT o CUI/i);
  }
});

test("normalizarNit recorta y pone en mayúsculas sin alterar el guion", () => {
  assert.equal(normalizarNit(" 1234567-k "), "1234567-K");
  assert.equal(normalizarNit("1234567K"), "1234567K");
});

test("total igual o mayor a Q2.500 admite NIT normalizado", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 251500,
    datos: { tipo: "nit", numero: " 1234567-k ", nombre: "  Empresa S.A.  " },
    esGuatex: false,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.numero, "1234567-K");
    assert.equal(res.nombre, "Empresa S.A.");
  }
});

test("el CUI son exactamente 13 dígitos numéricos", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 300000,
    datos: { tipo: "cui", numero: "1234567890101", nombre: "Carlos Pérez" },
    esGuatex: false,
  });
  assert.equal(res.ok, true);

  assert.equal(validarDatosFiscales({ totalOsubtotalCents: 300000, datos: { tipo: "cui", numero: "12345678", nombre: "A" }, esGuatex: false }).ok, false);
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: 300000, datos: { tipo: "cui", numero: "12345678901010", nombre: "A" }, esGuatex: false }).ok, false);
  assert.equal(validarDatosFiscales({ totalOsubtotalCents: 300000, datos: { tipo: "cui", numero: "123456789010A", nombre: "A" }, esGuatex: false }).ok, false);
});

test("Guatex con subtotal igual o mayor a Q2.500 rechaza CF", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 250000,
    datos: { tipo: "cf", nombre: "Consumidor Final" },
    esGuatex: true,
  });
  assert.equal(res.ok, false);
});

test("Guatex con NIT o CUI nace verificado", () => {
  const resNit = validarDatosFiscales({
    totalOsubtotalCents: 150000,
    datos: { tipo: "nit", numero: "12345678", nombre: "Cliente" },
    esGuatex: true,
  });
  assert.equal(resNit.ok, true);
  if (resNit.ok) assert.equal(resNit.verificado, true);

  const resCui = validarDatosFiscales({
    totalOsubtotalCents: 150000,
    datos: { tipo: "cui", numero: "1234567890101", nombre: "Cliente" },
    esGuatex: true,
  });
  assert.equal(resCui.ok, true);
  if (resCui.ok) assert.equal(resCui.verificado, true);
});

test("Guatex con subtotal menor a Q2.500 y CF nace pendiente de verificación", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 150000,
    datos: { tipo: "cf", nombre: "Consumidor Final" },
    esGuatex: true,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.verificado, false);
  }
});

test("el nombre para facturación es obligatorio", () => {
  const res = validarDatosFiscales({
    totalOsubtotalCents: 1000,
    datos: { tipo: "cf", nombre: "   " },
    esGuatex: false,
  });
  assert.equal(res.ok, false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-fiscal.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/pedidos/fiscal.ts
import type { TipoIdentificacionFiscal } from "./contratos";

/**
 * Umbral legal de la SAT: Q2.500,00 exactos, en centavos enteros.
 *
 * **No se toca desde el panel.** Es distinto del umbral comercial de envío gratuito
 * de `app/envios/tarifas.ts`, que sí es editable y que hoy coincide en importe por
 * casualidad. Confundirlos haría que subir la promoción cambiase la facturación.
 */
export const UMBRAL_FISCAL_SAT_CENTS = 250000;

export type DatosFiscalesInput = {
  tipo: TipoIdentificacionFiscal;
  numero?: string | null;
  nombre: string;
};

export type ResultadoValidacionFiscal =
  | { ok: true; tipo: TipoIdentificacionFiscal; numero: string | null; nombre: string; verificado: boolean }
  | { ok: false; error: string };

/** Recorta y normaliza a mayúsculas. La validez fiscal real la dirá FEL. */
export function normalizarNit(nit: string): string {
  return nit.trim().toUpperCase();
}

export function validarDatosFiscales(params: {
  totalOsubtotalCents: number;
  datos: DatosFiscalesInput;
  esGuatex: boolean;
}): ResultadoValidacionFiscal {
  const { totalOsubtotalCents, datos, esGuatex } = params;

  if (
    typeof totalOsubtotalCents !== "number" ||
    !Number.isInteger(totalOsubtotalCents) ||
    totalOsubtotalCents < 0
  ) {
    return { ok: false, error: "El importe monetario no es válido." };
  }

  const nombreLimpio = datos.nombre?.trim() ?? "";
  if (!nombreLimpio) {
    return { ok: false, error: "El nombre para facturación es obligatorio." };
  }

  if (totalOsubtotalCents >= UMBRAL_FISCAL_SAT_CENTS && datos.tipo === "cf") {
    return {
      ok: false,
      error: "Por regulaciones de la SAT, las compras de Q2.500 o más requieren NIT o CUI para facturación.",
    };
  }

  if (datos.tipo === "cf") {
    // Guatex desconoce el flete, así que su Consumidor Final nace pendiente de que
    // un administrador compruebe el importe final. Mensajero propio conoce el total
    // y no necesita esa segunda vuelta.
    return { ok: true, tipo: "cf", numero: null, nombre: nombreLimpio, verificado: !esGuatex };
  }

  const numeroLimpio = datos.numero?.trim() ?? "";
  if (!numeroLimpio) {
    return { ok: false, error: `El número de ${datos.tipo.toUpperCase()} es obligatorio.` };
  }

  if (datos.tipo === "cui") {
    if (!/^\d{13}$/.test(numeroLimpio)) {
      return { ok: false, error: "El CUI debe contener exactamente 13 dígitos numéricos." };
    }
    return { ok: true, tipo: "cui", numero: numeroLimpio, nombre: nombreLimpio, verificado: true };
  }

  return {
    ok: true,
    tipo: "nit",
    numero: normalizarNit(numeroLimpio),
    nombre: nombreLimpio,
    verificado: true,
  };
}
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-fiscal.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-fiscal.test.ts` a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 7**
  - Mensaje: `feat(pedidos): validacion fiscal SAT con umbral legal de Q2.500 y reglas CUI/NIT/CF`

---

### Tarea 8: Contrato de pago desacoplado (`ProveedorPago`)

**Files:**
- Crear: `app/pedidos/pago.ts`
- Crear: `tests/pedidos-pago.test.ts`

**Interfaces:**
- En `app/pedidos/pago.ts`:
  ```ts
  export type PedidoParaPago = { orderId: string; reference: string; totalCents: number };
  export type ResultadoInicioPago = { urlPago: string; transaccionId: string };
  export interface ProveedorPago {
    estaConfigurado(): boolean;
    iniciarPago(pedido: PedidoParaPago): Promise<ResultadoInicioPago>;
  }
  export const proveedorPagoSinConfigurar: ProveedorPago;
  ```

- [ ] **Paso 1: Escribir la prueba unitaria que falla (RED)**

```ts
// tests/pedidos-pago.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  proveedorPagoSinConfigurar,
  type PedidoParaPago,
  type ProveedorPago,
  type ResultadoInicioPago,
} from "../app/pedidos/pago";

test("el proveedor por defecto declara que no está configurado", () => {
  assert.equal(proveedorPagoSinConfigurar.estaConfigurado(), false);
});

test("el proveedor por defecto rechaza iniciarPago en lugar de simular un cobro", async () => {
  await assert.rejects(
    async () => {
      await proveedorPagoSinConfigurar.iniciarPago({
        orderId: "ord-1",
        reference: "EC-2K7M9P4XBW",
        totalCents: 3500,
      });
    },
    /no está configurada/i,
  );
});

test("PedidoParaPago no lleva identificador de cliente", () => {
  const pedido: PedidoParaPago = { orderId: "ord-1", reference: "EC-2K7M9P4XBW", totalCents: 3500 };
  assert.equal("clienteId" in pedido, false);
});

test("ResultadoInicioPago usa urlPago y transaccionId, sin bandera ok", async () => {
  const proveedorDoble: ProveedorPago = {
    estaConfigurado: () => true,
    iniciarPago: async (pedido): Promise<ResultadoInicioPago> => ({
      urlPago: `https://pasarela.example/pago/${pedido.reference}`,
      transaccionId: "trx-1",
    }),
  };

  const res = await proveedorDoble.iniciarPago({
    orderId: "ord-1",
    reference: "EC-2K7M9P4XBW",
    totalCents: 3500,
  });

  assert.equal(res.urlPago, "https://pasarela.example/pago/EC-2K7M9P4XBW");
  assert.equal(res.transaccionId, "trx-1");
  assert.equal("ok" in res, false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-pago.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/pedidos/pago.ts

/**
 * La frontera con la pasarela de pago, que todavía no existe (subproyecto 7).
 *
 * `PedidoParaPago` no lleva `clienteId`: para cobrar un importe no hace falta saber
 * quién compra, y no se le mandan a un tercero datos que no necesita.
 *
 * El proveedor por defecto **lanza** en vez de devolver una URL falsa. Simular un
 * cobro sería peor que no tener pasarela: el pedido quedaría marcado como pagado
 * sin que hubiera entrado un quetzal.
 */
export type PedidoParaPago = {
  orderId: string;
  reference: string;
  totalCents: number;
};

export type ResultadoInicioPago = {
  urlPago: string;
  transaccionId: string;
};

export interface ProveedorPago {
  estaConfigurado(): boolean;
  iniciarPago(pedido: PedidoParaPago): Promise<ResultadoInicioPago>;
}

export const proveedorPagoSinConfigurar: ProveedorPago = {
  estaConfigurado(): boolean {
    return false;
  },
  async iniciarPago(_pedido: PedidoParaPago): Promise<ResultadoInicioPago> {
    throw new Error("La pasarela de pago en línea no está configurada actualmente.");
  },
};
```

- [ ] **Paso 4: Ejecutar la prueba y comprobar que pasa (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-pago.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-pago.test.ts` a `test:datos`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 8**
  - Mensaje: `feat(pedidos): interfaz desacoplada ProveedorPago sin pasarela simulada`

---

### Tarea 9: Persistencia transaccional de pedidos con bloqueo de carrito e idempotencia

**Files:**
- Crear: `app/pedidos/pedidosRepositorio.ts` (núcleo inyectable puro, sin `server-only`, ejecutable en pruebas unitarias)
- Crear: `app/pedidos/pedidos.server.ts` (wrapper con `server-only` que inyecta Neon y el proveedor de pago oficial)
- Crear: `tests/pedidos-servicio.test.ts`

**Interfaces:**
- En `app/pedidos/pedidosRepositorio.ts`:
  ```ts
  export type Ejecutor = (sql: string, params?: readonly unknown[]) => Promise<readonly unknown[]>;
  export type DependenciasCreacionPedido = {
    escribir: <T>(trabajo: (ejecutar: Ejecutor) => Promise<T>, opciones?: { suceso?: string }) => Promise<T>;
    proveedorPago: { estaConfigurado(): boolean };
  };
  export function crearPedidoTransaccional(
    params: ParametrosCreacionPedido,
    deps: DependenciasCreacionPedido,
  ): Promise<ResultadoCrearPedido>;
  export function leerPedidoPorReferencia(
    referencia: string,
    userId: string,
    deps: { leer: <T>(sql: string, params?: readonly unknown[]) => Promise<readonly T[]> },
  ): Promise<PedidoConDetalle | null>;
  ```
  La indisponibilidad de la pasarela para un método soberano `mensajero_propio` se devuelve como un resultado de dominio discriminado (`ResultadoCrearPedido`) desde el callback transaccional, **no como una excepción**. Esto garantiza que la transacción finaliza limpiamente sin mutaciones (0 INSERTs, 0 DELETEs) y que el resultado de negocio no es interceptado ni transformado en un `ErrorDeDatos` genérico por la infraestructura de `app/lib/datos`.

- [ ] **Paso 1: Escribir la prueba unitaria de servicio y la prueba de regresión de infraestructura transaccional (RED)**

```ts
// tests/pedidos-servicio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { enTransaccion, type PoolMinimo, type ClienteDeTransaccion } from "../app/lib/datos/transaccion";
import {
  crearPedidoTransaccional,
  type DependenciasCreacionPedido,
  type Ejecutor,
} from "../app/pedidos/pedidosRepositorio";
import { esReferenciaValida } from "../app/pedidos/referencia";
import {
  CLAVE_AJUSTE_REGLAS_PROPIAS,
  CLAVE_AJUSTE_ZONAS_METODOS,
} from "../app/envios/configuracion";
import { mapaMetodosPorDefecto } from "../app/envios/zonasCapitalinas";

/** Las dos filas de `app_settings` que el Plan A siembra en la migración 015. */
function filasDeAjustes() {
  return [
    { clave: CLAVE_AJUSTE_ZONAS_METODOS, valor: JSON.stringify(mapaMetodosPorDefecto()) },
    {
      clave: CLAVE_AJUSTE_REGLAS_PROPIAS,
      valor: JSON.stringify({ tarifaCents: 3500, umbralGratisCents: 250000 }),
    },
  ];
}

const DIRECCION_ZONA_10 = {
  destinatario: "Juan Pérez",
  telefono: "55554444",
  departamentoCodigo: "01",
  municipioCodigo: "0101",
  zonaCapitalina: 10,
  linea1: "Avenida Reforma 1-00",
  referencias: null,
} as const;

test("bloquea el carrito, lee la configuración dentro de la transacción y deduce mensajero propio", async () => {
  const sentencias: string[] = [];
  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      return [{
        product_id: "prod-1",
        cantidad: 2,
        econoluz_reference: "ECO-001",
        public_name: "Lámpara",
        price_gtq: "150.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) return [{ id: "order-uuid-1" }];
    return [];
  };

  const fakeDeps: DependenciasCreacionPedido = {
    escribir: async (trabajo) => trabajo(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => true },
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "3f8b1c2d-4e5a-4b6c-8d9e-0a1b2c3d4e5f",
    fiscal: { tipo: "cf", numero: null, nombre: "Juan Pérez" },
    direccion: { ...DIRECCION_ZONA_10 },
  }, fakeDeps);

  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("Fallo: res debe ser ok");
  const resultado = res.pedido;

  assert.equal(resultado.orderId, "order-uuid-1");
  assert.equal(esReferenciaValida(resultado.reference), true);
  assert.equal(resultado.subtotalCents, 30000);
  assert.equal(resultado.shippingMethod, "mensajero_propio");
  assert.equal(resultado.shippingCostCents, 3500);
  assert.equal(resultado.totalCents, 33500);
  assert.equal(resultado.itemsCount, 2);
  assert.equal(resultado.status, "pendiente_de_pago");

  // Orden transaccional: carts -> idempotencia -> app_settings -> cart_items -> orders -> vaciar
  const idxCart = sentencias.findIndex((s) => /select id, fusion_tokens from carts[\s\S]*for update/i.test(s));
  const idxIdem = sentencias.findIndex((s) => /from orders[\s\S]*where user_id = \$1 and idempotency_key = \$2/i.test(s));
  const idxAjustes = sentencias.findIndex((s) => /select clave, valor from app_settings[\s\S]*for share/i.test(s));
  const idxLineas = sentencias.findIndex((s) => /select ci\.product_id[\s\S]*for update of ci/i.test(s));
  const idxOrden = sentencias.findIndex((s) => /insert into orders/i.test(s));
  const idxVaciar = sentencias.findIndex((s) => /delete from cart_items where cart_id = \$1/i.test(s));

  assert.ok(idxCart !== -1, "Debe bloquear carts con for update");
  assert.ok(idxIdem > idxCart, "Debe consultar la idempotencia tras bloquear carts");
  assert.ok(idxAjustes > idxIdem, "Debe leer app_settings dentro de la transacción bajo for share");
  assert.ok(idxLineas > idxAjustes, "Debe bloquear cart_items tras leer la configuración");
  assert.ok(idxOrden > idxLineas, "Debe insertar el pedido tras procesar las líneas");
  assert.ok(idxVaciar > idxOrden, "Debe vaciar el carrito bloqueado tras insertar el pedido");
});

test("regresión: PAGO_NO_DISPONIBLE devuelto dentro de la transacción atraviesa enTransaccion sin transformarse en ErrorDeDatos", async () => {
  const sentenciasEjecutadas: string[] = [];
  let liberado = false;

  const clienteSimulado: ClienteDeTransaccion = {
    query: async (texto: string) => {
      sentenciasEjecutadas.push(texto.trim());
      if (/^begin/i.test(texto)) return { rows: [] };
      if (/^set local statement_timeout/i.test(texto)) return { rows: [] };
      if (/^commit/i.test(texto)) return { rows: [] };
      if (/^rollback/i.test(texto)) return { rows: [] };
      if (/select id, fusion_tokens from carts/i.test(texto)) return { rows: [{ id: "cart-123", fusion_tokens: null }] };
      if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(texto)) return { rows: [] };
      if (/select clave, valor from app_settings/i.test(texto)) return { rows: filasDeAjustes() };
      if (/select ci\.product_id, ci\.cantidad/i.test(texto)) {
        return {
          rows: [{
            product_id: "prod-1",
            cantidad: 1,
            econoluz_reference: "ECO-001",
            public_name: "Lámpara",
            price_gtq: "150.00",
            published: true,
          }],
        };
      }
      return { rows: [] };
    },
    release: () => {
      liberado = true;
    },
  };

  const poolSimulado: PoolMinimo = {
    connect: async () => clienteSimulado,
  };

  const depsConInfraestructuraReal: DependenciasCreacionPedido = {
    escribir: (trabajo) => enTransaccion(poolSimulado, trabajo),
    proveedorPago: { estaConfigurado: () => false },
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "regresion-transaccion-pago-indisponible",
    fiscal: { tipo: "cf", numero: null, nombre: "Juan Pérez" },
    direccion: { ...DIRECCION_ZONA_10 },
  }, depsConInfraestructuraReal);

  assert.equal(res.ok, false);
  if (res.ok) throw new Error("Fallo: res no debe ser ok");
  assert.equal(res.codigo, "PAGO_NO_DISPONIBLE");
  assert.match(res.error, /pago en línea no está disponible/i);

  // Verificación estricta de la infraestructura transaccional:
  assert.equal(liberado, true, "El cliente debe liberarse al pool");
  assert.ok(sentenciasEjecutadas.some((s) => /^begin/i.test(s)), "Debe iniciar transacción con begin");
  assert.ok(sentenciasEjecutadas.some((s) => /^commit/i.test(s)), "Debe finalizar con commit al retornar resultado de dominio");
  assert.equal(sentenciasEjecutadas.some((s) => /^rollback/i.test(s)), false, "No debe ejecutar rollback porque no se lanzó excepción");
  assert.equal(sentenciasEjecutadas.some((s) => /insert into orders/i.test(s)), false, "0 INSERTs en orders");
  assert.equal(sentenciasEjecutadas.some((s) => /insert into order_items/i.test(s)), false, "0 INSERTs en order_items");
  assert.equal(sentenciasEjecutadas.some((s) => /insert into order_addresses/i.test(s)), false, "0 INSERTs en order_addresses");
  assert.equal(sentenciasEjecutadas.some((s) => /delete from cart_items/i.test(s)), false, "0 DELETEs en cart_items");
});

test("zona derivada a Guatex por configuración: coste y total desconocidos, nunca cero", async () => {
  const fakeEjecutar: Ejecutor = async (sql) => {
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      return [{
        product_id: "prod-1",
        cantidad: 1,
        econoluz_reference: "ECO-002",
        public_name: "Panel",
        price_gtq: "150.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) return [{ id: "order-guatex-1" }];
    return [];
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "5c1d9a70-2f3e-4a11-9c88-77b2e4d1a900",
    fiscal: { tipo: "cf", numero: null, nombre: "Juan Pérez" },
    // La zona 17 sale de `mapaMetodosPorDefecto()` como `guatex`.
    direccion: { ...DIRECCION_ZONA_10, zonaCapitalina: 17 },
  }, {
    escribir: async (t) => t(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => false }, // No requiere pasarela
  });

  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("Fallo: res debe ser ok");
  const resultado = res.pedido;

  assert.equal(resultado.shippingMethod, "guatex");
  assert.equal(resultado.shippingCostCents, null);
  assert.equal(resultado.totalCents, null);
  assert.equal(resultado.status, "pendiente_de_contacto");
});

test("se niega a crear el pedido si falta la configuración oficial de envíos", async () => {
  const sentencias: string[] = [];
  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    // `app_settings` responde sin las claves: configuración ilegible.
    if (/select clave, valor from app_settings/i.test(sql)) return [];
    return [];
  };

  await assert.rejects(
    async () => {
      await crearPedidoTransaccional({
        userId: "42",
        idempotencyKey: "9a2f5b31-6c7d-4e88-b0a1-2c3d4e5f6071",
        fiscal: { tipo: "cf", numero: null, nombre: "Juan Pérez" },
        direccion: { ...DIRECCION_ZONA_10 },
      }, {
        escribir: async (t) => t(fakeEjecutar),
        proveedorPago: { estaConfigurado: () => true },
      });
    },
    /configuración de envíos/i,
  );

  assert.equal(
    sentencias.some((s) => /insert into orders/i.test(s)),
    false,
    "No puede crearse ningún pedido sin la configuración oficial",
  );
});

test("persiste el NIT normalizado y el nombre saneado que devuelve validarDatosFiscales", async () => {
  let paramsInsertOrders: readonly unknown[] = [];
  const fakeEjecutar: Ejecutor = async (sql, params) => {
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      return [{
        product_id: "prod-1",
        cantidad: 1,
        econoluz_reference: "ECO-003",
        public_name: "Foco",
        price_gtq: "100.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) {
      paramsInsertOrders = params ?? [];
      return [{ id: "order-nit-1" }];
    }
    return [];
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
    fiscal: { tipo: "nit", numero: " 1234567-k ", nombre: "  Empresa S.A.  " },
    direccion: { ...DIRECCION_ZONA_10 },
  }, {
    escribir: async (t) => t(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => true },
  });

  assert.equal(res.ok, true);
  assert.ok(paramsInsertOrders.includes("1234567-K"), "Debe persistir el NIT normalizado");
  assert.ok(paramsInsertOrders.includes("Empresa S.A."), "Debe persistir el nombre saneado");
});

test("bajo el bloqueo, rechaza CF si el total con envío alcanza Q2.500", async () => {
  const sentencias: string[] = [];
  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      // Q2.480,00 de productos + Q35,00 de envío = Q2.515,00
      return [{
        product_id: "p1",
        cantidad: 1,
        econoluz_reference: "ECO-004",
        public_name: "Luminaria",
        price_gtq: "2480.00",
        published: true,
      }];
    }
    return [];
  };

  await assert.rejects(
    async () => {
      await crearPedidoTransaccional({
        userId: "42",
        idempotencyKey: "7d8e9f01-2a3b-4c5d-8e9f-0a1b2c3d4e5f",
        fiscal: { tipo: "cf", numero: null, nombre: "Consumidor Final" },
        direccion: { ...DIRECCION_ZONA_10, zonaCapitalina: 1 },
      }, {
        escribir: async (t) => t(fakeEjecutar),
        proveedorPago: { estaConfigurado: () => true },
      });
    },
    /regulaciones de la SAT/i,
  );

  assert.equal(sentencias.some((s) => /insert into orders/i.test(s)), false);
});

test("repetición idempotente recupera el pedido guardado según su propio shipping_method sin reevaluar zonas ni pasarela", async () => {
  const sentencias: string[] = [];
  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) {
      return [{
        id: "order-previo-1",
        reference: "EC-2K7M9P4XBW",
        status: "pendiente_de_contacto",
        shipping_method: "guatex",
        shipping_cost_cents: null,
        subtotal_cents: 20000,
        total_cents: null,
        total_items: 5,
      }];
    }
    return [];
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
    fiscal: { tipo: "cf", numero: null, nombre: "Consumidor Final" },
    direccion: { ...DIRECCION_ZONA_10, zonaCapitalina: 1 },
  }, {
    escribir: async (t) => t(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => false }, // No importa si la pasarela está deshabilitada
  });

  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("Fallo: res debe ser ok");
  const resultado = res.pedido;

  assert.equal(resultado.orderId, "order-previo-1");
  assert.equal(resultado.reference, "EC-2K7M9P4XBW");
  assert.equal(resultado.itemsCount, 5, "Las unidades salen de order_items del pedido releído");
  assert.equal(sentencias.some((s) => /select clave, valor from app_settings/i.test(s)), false, "No lee app_settings si ya existe");
  assert.equal(sentencias.some((s) => /delete from cart_items/i.test(s)), false, "No vuelve a vaciar el carrito");
  assert.equal(sentencias.some((s) => /insert into order_items/i.test(s)), false, "No reinserta líneas");
});

test("colisión de orders_user_idempotency_unique: relee el pedido y devuelve el DTO completo", async () => {
  const sentencias: string[] = [];
  let primeraConsultaDeIdempotencia = true;

  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) {
      if (primeraConsultaDeIdempotencia) {
        // Todavía no existe: la petición gemela aún no ha confirmado.
        primeraConsultaDeIdempotencia = false;
        return [];
      }
      // Relectura tras la colisión: ahora sí existe, con sus unidades reales.
      return [{
        id: "order-gemelo-1",
        reference: "EC-9WKD3PZ7MB",
        status: "pendiente_de_pago",
        shipping_method: "mensajero_propio",
        shipping_cost_cents: 3500,
        subtotal_cents: 30000,
        total_cents: 33500,
        total_items: 2,
      }];
    }
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      // El carrito actual dice otra cosa: no debe usarse para construir la respuesta.
      return [{
        product_id: "prod-9",
        cantidad: 99,
        econoluz_reference: "ECO-099",
        public_name: "Otro",
        price_gtq: "10.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) {
      const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        constraint: "orders_user_idempotency_unique",
      });
      throw error;
    }
    return [];
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "aa11bb22-cc33-4d44-8e55-ff6677889900",
    fiscal: { tipo: "cf", numero: null, nombre: "Consumidor Final" },
    direccion: { ...DIRECCION_ZONA_10 },
  }, {
    escribir: async (t) => t(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => true },
  });

  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("Fallo: res debe ser ok");
  const resultado = res.pedido;

  assert.equal(resultado.orderId, "order-gemelo-1");
  assert.equal(resultado.reference, "EC-9WKD3PZ7MB");
  assert.equal(resultado.subtotalCents, 30000, "El subtotal sale del pedido releído, no del carrito actual");
  assert.equal(resultado.totalCents, 33500);
  assert.equal(resultado.itemsCount, 2, "Las unidades salen de order_items, no del carrito actual");
  assert.equal(sentencias.some((s) => /insert into order_items/i.test(s)), false, "No reinserta líneas");
  assert.equal(sentencias.some((s) => /delete from cart_items/i.test(s)), false, "No vuelve a vaciar el carrito");
});

test("colisión de referencia: reintenta con SAVEPOINT y acaba insertando", async () => {
  let intentosDeInsercion = 0;
  const sentencias: string[] = [];

  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      return [{
        product_id: "prod-1",
        cantidad: 1,
        econoluz_reference: "ECO-005",
        public_name: "Foco",
        price_gtq: "100.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) {
      intentosDeInsercion += 1;
      if (intentosDeInsercion === 1) {
        throw Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint: "orders_reference_key",
        });
      }
      return [{ id: "order-tras-colision" }];
    }
    return [];
  };

  const res = await crearPedidoTransaccional({
    userId: "42",
    idempotencyKey: "bb22cc33-dd44-4e55-9f66-001122334455",
    fiscal: { tipo: "cf", numero: null, nombre: "Consumidor Final" },
    direccion: { ...DIRECCION_ZONA_10 },
  }, {
    escribir: async (t) => t(fakeEjecutar),
    proveedorPago: { estaConfigurado: () => true },
  });

  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("Fallo: res debe ser ok");
  const resultado = res.pedido;

  assert.equal(resultado.orderId, "order-tras-colision");
  assert.equal(intentosDeInsercion, 2);
  assert.equal(sentencias.some((s) => /rollback to savepoint sp_referencia/i.test(s)), true);
});

test("si falla la inserción de líneas, el error se propaga y el carrito no se vacía", async () => {
  const sentencias: string[] = [];
  const fakeEjecutar: Ejecutor = async (sql) => {
    sentencias.push(sql.trim());
    if (/select id, fusion_tokens from carts/i.test(sql)) return [{ id: "cart-123", fusion_tokens: null }];
    if (/from orders\s+where user_id = \$1 and idempotency_key = \$2/i.test(sql)) return [];
    if (/select clave, valor from app_settings/i.test(sql)) return filasDeAjustes();
    if (/select ci\.product_id, ci\.cantidad/i.test(sql)) {
      return [{
        product_id: "prod-1",
        cantidad: 1,
        econoluz_reference: "ECO-006",
        public_name: "Foco",
        price_gtq: "100.00",
        published: true,
      }];
    }
    if (/insert into orders/i.test(sql)) return [{ id: "order-1" }];
    if (/insert into order_items/i.test(sql)) throw new Error("Fallo de integridad simulado en order_items");
    return [];
  };

  await assert.rejects(
    async () => {
      await crearPedidoTransaccional({
        userId: "42",
        idempotencyKey: "cc33dd44-ee55-4f66-8071-223344556677",
        fiscal: { tipo: "cf", numero: null, nombre: "Consumidor Final" },
        direccion: { ...DIRECCION_ZONA_10 },
      }, {
        escribir: async (t) => t(fakeEjecutar),
        proveedorPago: { estaConfigurado: () => true },
      });
    },
    /Fallo de integridad simulado/,
  );

  assert.equal(sentencias.some((s) => /delete from cart_items/i.test(s)), false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-servicio.test.ts`

- [ ] **Paso 3: Escribir la implementación completa (GREEN)**

```ts
// app/pedidos/pedidosRepositorio.ts
import { aCentavos } from "../lib/dinero";
import {
  CLAVE_AJUSTE_REGLAS_PROPIAS,
  CLAVE_AJUSTE_ZONAS_METODOS,
  interpretarReglasPropias,
  interpretarZonasMetodos,
} from "../envios/configuracion";
import { calcularTarifaMensajeroPropio } from "../envios/tarifas";
import { esZonaCapitalinaValida, type ZonaCapitalina } from "../envios/zonasCapitalinas";
import { validarDatosFiscales } from "./fiscal";
import { generarReferenciaPedido } from "./referencia";
import type {
  EstadoPedido,
  MetodoEnvio,
  ParametrosCreacionPedido,
  PedidoConDetalle,
  PedidoCreado,
  ResultadoCrearPedido,
  TipoIdentificacionFiscal,
} from "./contratos";

export type Ejecutor = (sql: string, params?: readonly unknown[]) => Promise<readonly unknown[]>;

export type DependenciasCreacionPedido = {
  escribir: <T>(trabajo: (ejecutar: Ejecutor) => Promise<T>, opciones?: { suceso?: string }) => Promise<T>;
  proveedorPago: { estaConfigurado(): boolean };
};

/**
 * Un guardián de tipo de verdad, no un `as`.
 *
 * El error que llega de PostgreSQL es `unknown`, y estrechar una variable distinta
 * de la que luego se lee —`err?.code` sobre un objeto ya convertido— deja pasar
 * cualquier cosa. Aquí se comprueba la forma una vez y TypeScript la conserva.
 */
function esErrorPostgres(error: unknown): error is { code: string; constraint?: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

type FilaPedidoPrevio = {
  id: string;
  reference: string;
  status: string;
  shipping_method: string;
  shipping_cost_cents: number | null;
  subtotal_cents: number;
  total_cents: number | null;
  total_items: number;
};

/**
 * La consulta con la que se recupera un pedido ya existente por su clave de
 * idempotencia. Suma las unidades desde `order_items` en la misma sentencia, para
 * que el DTO devuelto describa el pedido guardado y **nunca** el carrito actual.
 */
const SQL_PEDIDO_POR_IDEMPOTENCIA = `
  SELECT o.id, o.reference, o.status, o.shipping_method, o.shipping_cost_cents,
         o.subtotal_cents, o.total_cents,
         COALESCE(SUM(i.quantity), 0)::int AS total_items
    FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id
   WHERE o.user_id = $1 AND o.idempotency_key = $2
   GROUP BY o.id`;

function aPedidoCreado(fila: FilaPedidoPrevio): PedidoCreado {
  return {
    orderId: fila.id,
    reference: fila.reference,
    status: fila.status as EstadoPedido,
    shippingMethod: fila.shipping_method as MetodoEnvio,
    shippingCostCents: fila.shipping_cost_cents,
    subtotalCents: fila.subtotal_cents,
    totalCents: fila.total_cents,
    itemsCount: fila.total_items,
  };
}

export async function crearPedidoTransaccional(
  params: ParametrosCreacionPedido,
  deps: DependenciasCreacionPedido,
): Promise<ResultadoCrearPedido> {
  const { userId, idempotencyKey, fiscal, direccion } = params;

  return deps.escribir(
    async (ejecutar) => {
      // 1. Bloquear la fila de `carts` del cliente. Bloquear antes de leer es lo que
      //    impide que dos pestañas creen dos pedidos con el mismo carrito.
      const filasCarrito = (await ejecutar(
        "SELECT id, fusion_tokens FROM carts WHERE user_id = $1 FOR UPDATE",
        [userId],
      )) as Array<{ id: string; fusion_tokens: unknown }>;

      if (filasCarrito.length === 0) {
        throw new Error("El carrito no existe o no pertenece al cliente.");
      }
      const cartId = filasCarrito[0].id;

      // 2. Idempotencia previa: si ya hay pedido para esta clave, se devuelve tal cual.
      //    Esto preserva el pedido existente con su propio shipping_method sin reevaluar zonas ni pasarela.
      const previos = (await ejecutar(SQL_PEDIDO_POR_IDEMPOTENCIA, [userId, idempotencyKey])) as FilaPedidoPrevio[];
      if (previos.length > 0) {
        return { ok: true, pedido: aPedidoCreado(previos[0]) };
      }

      // 3. Configuración oficial de envíos, leída dentro de la transacción y con las
      //    claves canónicas del Plan A. `FOR SHARE` impide que un cambio del panel se
      //    cuele entre el cálculo y la inserción.
      const filasAjustes = (await ejecutar(
        `SELECT clave, valor FROM app_settings
          WHERE clave IN ($1, $2)
          FOR SHARE`,
        [CLAVE_AJUSTE_ZONAS_METODOS, CLAVE_AJUSTE_REGLAS_PROPIAS],
      )) as Array<{ clave: string; valor: string }>;

      const mapaAjustes = new Map(filasAjustes.map((fila) => [fila.clave, fila.valor]));
      if (!mapaAjustes.has(CLAVE_AJUSTE_ZONAS_METODOS) || !mapaAjustes.has(CLAVE_AJUSTE_REGLAS_PROPIAS)) {
        // Fallo seguro: sin configuración oficial no se inventa ninguna. La
        // transacción se deshace y el carrito queda intacto.
        throw new Error(
          "No se pudo leer la configuración de envíos: el pedido no se ha creado y tu carrito sigue intacto.",
        );
      }

      const metodosZonas = interpretarZonasMetodos(mapaAjustes.get(CLAVE_AJUSTE_ZONAS_METODOS));
      const reglasPropias = interpretarReglasPropias(mapaAjustes.get(CLAVE_AJUSTE_REGLAS_PROPIAS));

      // 4. Bloquear y leer las líneas del carrito unidas con el catálogo.
      const lineas = (await ejecutar(
        `SELECT ci.product_id, ci.cantidad, p.econoluz_reference, p.public_name, p.price_gtq, p.published
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.cart_id = $1
          FOR UPDATE OF ci`,
        [cartId],
      )) as Array<{
        product_id: string;
        cantidad: number;
        econoluz_reference: string;
        public_name: string;
        price_gtq: string | number;
        published: boolean;
      }>;

      if (lineas.length === 0) {
        throw new Error("El carrito está vacío.");
      }

      // 5. Recalcular el importe en el servidor. Nada que venga del navegador cuenta.
      let subtotalCents = 0;
      let itemsCount = 0;
      const preciosPorProducto = new Map<string, number>();
      for (const linea of lineas) {
        if (!linea.published) {
          throw new Error(`El producto ${linea.econoluz_reference} ya no está disponible.`);
        }
        const precioCentavos = aCentavos(Number(linea.price_gtq));
        if (!Number.isInteger(precioCentavos) || precioCentavos <= 0) {
          throw new Error(`El producto ${linea.econoluz_reference} no tiene un precio válido.`);
        }
        preciosPorProducto.set(linea.product_id, precioCentavos);
        subtotalCents += precioCentavos * linea.cantidad;
        itemsCount += linea.cantidad;
      }

      // 6. Deducir método soberano, coste y estado con la configuración oficial.
      let shippingMethod: MetodoEnvio = "guatex";
      let shippingCostCents: number | null = null;
      let totalCents: number | null = null;
      let status: EstadoPedido = "pendiente_de_contacto";

      if (direccion.departamentoCodigo === "01" && direccion.municipioCodigo === "0101") {
        if (!esZonaCapitalinaValida(direccion.zonaCapitalina)) {
          throw new Error("La zona capitalina es obligatoria y debe ser válida en el municipio de Guatemala.");
        }
        const zona: ZonaCapitalina = direccion.zonaCapitalina;
        const metodoDeLaZona = metodosZonas[zona];
        if (metodoDeLaZona === "mensajero_propio") {
          // Comprobación síncrona dentro de la transacción bajo bloqueo FOR SHARE.
          // Si la pasarela no está configurada, se retorna un resultado de dominio discriminado
          // directamente desde el callback transaccional. La transacción finaliza limpiamente
          // sin mutaciones (0 INSERTs, 0 DELETEs), garantizando que el resultado sobrevive
          // a la frontera transaccional sin degradarse a ErrorDeDatos.
          if (!deps.proveedorPago.estaConfigurado()) {
            return {
              ok: false,
              codigo: "PAGO_NO_DISPONIBLE",
              error:
                "El pago en línea no está disponible en este momento, así que no hemos creado el pedido ni tocado tu carrito. Escríbenos por WhatsApp y lo cerramos contigo.",
            };
          }
          const calculo = calcularTarifaMensajeroPropio(subtotalCents, reglasPropias);
          shippingMethod = "mensajero_propio";
          shippingCostCents = calculo.envioCents;
          totalCents = subtotalCents + calculo.envioCents;
          status = "pendiente_de_pago";
        }
      }

      // 7. Validación fiscal sobre el importe realmente facturado.
      const importeFacturado = totalCents ?? subtotalCents;
      const validacionFiscal = validarDatosFiscales({
        totalOsubtotalCents: importeFacturado,
        datos: fiscal,
        esGuatex: shippingMethod === "guatex",
      });
      if (!validacionFiscal.ok) {
        throw new Error(validacionFiscal.error);
      }

      // Propiedades planas del resultado ya estrechado por `ok`.
      const fiscalTipoFinal = validacionFiscal.tipo;
      const fiscalNumeroFinal = validacionFiscal.numero;
      const fiscalNombreFinal = validacionFiscal.nombre;
      const fiscalVerificado = validacionFiscal.verificado;

      // 8. Insertar el pedido, con SAVEPOINT para que una colisión de referencia no
      //    aborte la transacción entera.
      let reference = "";
      let orderId = "";

      for (let intento = 1; intento <= 3; intento++) {
        reference = generarReferenciaPedido();
        await ejecutar("SAVEPOINT sp_referencia");
        try {
          const filasOrden = (await ejecutar(
            `INSERT INTO orders (
               user_id, reference, status, shipping_method, shipping_cost_cents,
               subtotal_cents, total_cents, fiscal_tipo, fiscal_numero, fiscal_nombre,
               fiscal_verificado, idempotency_key
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
              userId,
              reference,
              status,
              shippingMethod,
              shippingCostCents,
              subtotalCents,
              totalCents,
              fiscalTipoFinal,
              fiscalNumeroFinal,
              fiscalNombreFinal,
              fiscalVerificado,
              idempotencyKey,
            ],
          )) as Array<{ id: string }>;

          orderId = filasOrden[0].id;
          await ejecutar("RELEASE SAVEPOINT sp_referencia");
          break;
        } catch (error: unknown) {
          await ejecutar("ROLLBACK TO SAVEPOINT sp_referencia");

          if (!esErrorPostgres(error) || error.code !== "23505") {
            throw error;
          }

          if (error.constraint === "orders_user_idempotency_unique") {
            // La petición gemela ganó la carrera. Se relee el pedido guardado y se
            // devuelve entero: ni se reinsertan líneas ni se vuelve a vaciar nada.
            const relectura = (await ejecutar(SQL_PEDIDO_POR_IDEMPOTENCIA, [
              userId,
              idempotencyKey,
            ])) as FilaPedidoPrevio[];
            if (relectura.length > 0) {
              return { ok: true, pedido: aPedidoCreado(relectura[0]) };
            }
            throw error;
          }

          if (error.constraint === "orders_reference_key" && intento < 3) {
            continue;
          }

          throw new Error("Agotados los reintentos para generar una referencia única de pedido.");
        }
      }

      if (!orderId) {
        throw new Error("Agotados los reintentos para generar una referencia única de pedido.");
      }

      // 9. Líneas del pedido, con su instantánea de referencia y nombre.
      for (const linea of lineas) {
        await ejecutar(
          `INSERT INTO order_items (
             order_id, product_id, quantity, unit_price_cents, snapshot_reference, snapshot_title
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            linea.product_id,
            linea.cantidad,
            preciosPorProducto.get(linea.product_id),
            linea.econoluz_reference,
            linea.public_name,
          ],
        );
      }

      // 10. Instantánea de la dirección de entrega.
      await ejecutar(
        `INSERT INTO order_addresses (
           order_id, recipient_name, phone, departamento_codigo, municipio_codigo,
           zona_capitalina, line1, references_note
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orderId,
          direccion.destinatario,
          direccion.telefono,
          direccion.departamentoCodigo,
          direccion.municipioCodigo,
          direccion.zonaCapitalina,
          direccion.linea1,
          direccion.referencias,
        ],
      );

      // 11. Auditoría sin ningún dato personal ni fiscal identificable.
      await ejecutar(
        `INSERT INTO audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, despues)
         VALUES ('cliente', $1, 'crear_pedido', 'orders', $2, $3::jsonb)`,
        [
          userId,
          orderId,
          JSON.stringify({
            reference,
            metodoEnvio: shippingMethod,
            subtotalCents,
            totalCents,
            itemsCount,
            fiscalTipo: fiscalTipoFinal,
          }),
        ],
      );

      // 12. Vaciar únicamente el carrito bloqueado.
      await ejecutar("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);

      return {
        ok: true,
        pedido: {
          orderId,
          reference,
          status,
          shippingMethod,
          shippingCostCents,
          subtotalCents,
          totalCents,
          itemsCount,
        },
      };
    },
    { suceso: "crear-pedido-transaccional" },
  );
}

type FilaOrdenDetalle = {
  id: string;
  reference: string;
  user_id: string;
  status: string;
  shipping_method: string;
  shipping_cost_cents: number | null;
  subtotal_cents: number;
  total_cents: number | null;
  fiscal_tipo: string;
  fiscal_numero: string | null;
  fiscal_nombre: string;
  fiscal_verificado: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  destinatario: string;
  telefono: string;
  departamento_codigo: string;
  municipio_codigo: string;
  zona_capitalina: number | null;
  linea1: string;
  referencias: string | null;
};

type FilaItemDetalle = {
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  snapshot_reference: string;
  snapshot_title: string;
};

export async function leerPedidoPorReferencia(
  referencia: string,
  userId: string,
  deps: { leer: <T>(sql: string, params?: readonly unknown[]) => Promise<readonly T[]> },
): Promise<PedidoConDetalle | null> {
  // La referencia pública nunca autoriza por sí sola: siempre viaja con el `user_id`
  // de la sesión, así que un pedido ajeno no se distingue de uno inexistente.
  const filas = await deps.leer<FilaOrdenDetalle>(
    `SELECT o.id, o.reference, o.user_id, o.status, o.shipping_method, o.shipping_cost_cents,
            o.subtotal_cents, o.total_cents, o.fiscal_tipo, o.fiscal_numero, o.fiscal_nombre,
            o.fiscal_verificado, o.created_at, o.updated_at,
            oa.recipient_name AS destinatario, oa.phone AS telefono, oa.departamento_codigo,
            oa.municipio_codigo, oa.zona_capitalina, oa.line1 AS linea1,
            oa.references_note AS referencias
       FROM orders o
       JOIN order_addresses oa ON oa.order_id = o.id
      WHERE o.reference = $1 AND o.user_id = $2`,
    [referencia, userId],
  );

  const fila = filas[0];
  if (!fila) return null;

  const items = await deps.leer<FilaItemDetalle>(
    `SELECT product_id, quantity, unit_price_cents, snapshot_reference, snapshot_title
       FROM order_items
      WHERE order_id = $1
      ORDER BY created_at, id`,
    [fila.id],
  );

  return {
    id: fila.id,
    reference: fila.reference,
    userId: fila.user_id,
    status: fila.status as EstadoPedido,
    shippingMethod: fila.shipping_method as MetodoEnvio,
    shippingCostCents: fila.shipping_cost_cents,
    subtotalCents: fila.subtotal_cents,
    totalCents: fila.total_cents,
    fiscal: {
      tipo: fila.fiscal_tipo as TipoIdentificacionFiscal,
      numero: fila.fiscal_numero,
      nombre: fila.fiscal_nombre,
      verificado: fila.fiscal_verificado,
    },
    direccion: {
      destinatario: fila.destinatario,
      telefono: fila.telefono,
      departamentoCodigo: fila.departamento_codigo,
      municipioCodigo: fila.municipio_codigo,
      zonaCapitalina: fila.zona_capitalina,
      linea1: fila.linea1,
      referencias: fila.referencias,
    },
    items: items.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      snapshotReference: item.snapshot_reference,
      snapshotTitle: item.snapshot_title,
    })),
    createdAt: new Date(fila.created_at),
    updatedAt: new Date(fila.updated_at),
  };
}
```

```ts
// app/pedidos/pedidos.server.ts
import "server-only";

import { escribir, leer } from "../lib/datos";
import { proveedorPagoSinConfigurar } from "./pago";
import {
  crearPedidoTransaccional as crearTransaccional,
  leerPedidoPorReferencia as leerPorReferencia,
} from "./pedidosRepositorio";
import type { ParametrosCreacionPedido, PedidoConDetalle, ResultadoCrearPedido } from "./contratos";

export async function crearPedidoTransaccional(
  params: ParametrosCreacionPedido,
): Promise<ResultadoCrearPedido> {
  // El `Ejecutor` de `app/lib/datos` devuelve `Record<string, unknown>[]`, que encaja
  // en el `readonly unknown[]` que espera el repositorio: no hace falta ninguna
  // conversión de tipo, y por eso no hay ninguna.
  return crearTransaccional(params, {
    escribir: (trabajo, opciones) => escribir((ejecutar) => trabajo(ejecutar), opciones),
    proveedorPago: proveedorPagoSinConfigurar,
  });
}

export async function leerPedidoPorReferencia(
  referencia: string,
  userId: string,
): Promise<PedidoConDetalle | null> {
  return leerPorReferencia(referencia, userId, { leer });
}
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-servicio.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-servicio.test.ts` a `test:datos`.
  - Ejecutar: `npm run test:datos && npm run typecheck && npm run lint`.

- [ ] **Paso 6: Commit de la tarea 9**
  - Mensaje: `feat(pedidos): persistencia transaccional con configuracion oficial e idempotencia releida`

---

### Tarea 10: Notificación administrativa desacoplada por correo (Resend)

**Files:**
- Crear: `app/pedidos/notificacion.ts` (módulo puro inyectable)
- Crear: `app/pedidos/notificacion.server.ts` (wrapper con `server-only`)
- Crear: `tests/pedidos-notificacion.test.ts`

**Interfaces:**
- En `app/pedidos/notificacion.ts`:
  ```ts
  export type DatosNotificacionPedido = {
    reference: string;
    metodoEnvio: MetodoEnvio;
    subtotalCents: number;
    totalCents: number | null;
    itemsCount: number;
    destinatario: string;
    departamentoCodigo: string;
    municipioCodigo: string;
  };
  export type RegistroEscalar = Record<string, string | number | boolean>;
  export type DependenciasNotificacion = {
    enviarCorreo: (opciones: { para: string; asunto: string; cuerpoHtml: string }) => Promise<{ ok: boolean; id?: string }>;
    correoAdmin: string;
    apiKeyPresente: boolean;
    registrarLog: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
  };
  export function notificarNuevoPedido(
    datos: DatosNotificacionPedido,
    deps: DependenciasNotificacion,
  ): Promise<boolean>;
  ```
  `DatosNotificacionPedido` **no lleva el nombre del cliente**: el correo interno se identifica con la referencia del pedido, y el nombre es un dato personal que no necesita viajar a un tercero.

- [ ] **Paso 1: Escribir la prueba unitaria de notificación desacoplada (RED)**

```ts
// tests/pedidos-notificacion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  notificarNuevoPedido,
  type DatosNotificacionPedido,
  type DependenciasNotificacion,
  type RegistroEscalar,
} from "../app/pedidos/notificacion";

type Anotacion = { nivel: string; suceso: string; datos?: RegistroEscalar };

const PEDIDO_GUATEX: DatosNotificacionPedido = {
  reference: "EC-2K7M9P4XBW",
  metodoEnvio: "guatex",
  subtotalCents: 15000,
  totalCents: null,
  itemsCount: 2,
  destinatario: "Carlos Ruiz",
  departamentoCodigo: "01",
  municipioCodigo: "0101",
};

test("sin API key no se intenta la llamada de red y queda constancia en el log", async () => {
  const anotaciones: Anotacion[] = [];
  let intentoEnvio = false;

  const deps: DependenciasNotificacion = {
    enviarCorreo: async () => {
      intentoEnvio = true;
      return { ok: true };
    },
    correoAdmin: "pedidos@econoluz.net",
    apiKeyPresente: false,
    registrarLog: (nivel, suceso, datos) => anotaciones.push({ nivel, suceso, datos }),
  };

  const ok = await notificarNuevoPedido(PEDIDO_GUATEX, deps);

  assert.equal(ok, false);
  assert.equal(intentoEnvio, false, "No debe intentar la llamada de red sin credenciales");
  assert.equal(anotaciones.length, 1);
  assert.equal(anotaciones[0].suceso, "notificacion-correo-omitida-sin-credenciales");
});

test("si el envío falla no se propaga la excepción y solo se registran escalares", async () => {
  const anotaciones: Anotacion[] = [];

  const deps: DependenciasNotificacion = {
    enviarCorreo: async () => {
      throw new Error("Fallo de red en Resend");
    },
    correoAdmin: "pedidos@econoluz.net",
    apiKeyPresente: true,
    registrarLog: (nivel, suceso, datos) => anotaciones.push({ nivel, suceso, datos }),
  };

  const ok = await notificarNuevoPedido(
    { ...PEDIDO_GUATEX, metodoEnvio: "mensajero_propio", totalCents: 23500 },
    deps,
  );

  assert.equal(ok, false);
  assert.equal(anotaciones.length, 1);
  assert.equal(anotaciones[0].nivel, "error");
  assert.equal(anotaciones[0].suceso, "notificacion-correo-fallida");
  assert.equal(anotaciones[0].datos?.reference, "EC-2K7M9P4XBW");
  assert.equal(anotaciones[0].datos?.destinatario, undefined, "El nombre no puede llegar al log");
});

test("con credenciales, envía y devuelve true", async () => {
  const anotaciones: Anotacion[] = [];
  let asuntoEnviado = "";

  const deps: DependenciasNotificacion = {
    enviarCorreo: async (opciones) => {
      asuntoEnviado = opciones.asunto;
      return { ok: true, id: "correo-1" };
    },
    correoAdmin: "pedidos@econoluz.net",
    apiKeyPresente: true,
    registrarLog: (nivel, suceso, datos) => anotaciones.push({ nivel, suceso, datos }),
  };

  const ok = await notificarNuevoPedido(PEDIDO_GUATEX, deps);

  assert.equal(ok, true);
  assert.match(asuntoEnviado, /EC-2K7M9P4XBW/);
  assert.equal(anotaciones[0].suceso, "notificacion-correo-enviada");
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-notificacion.test.ts`

- [ ] **Paso 3: Escribir la implementación completa (GREEN)**

```ts
// app/pedidos/notificacion.ts
import { aQuetzales } from "../lib/dinero";
import { formatPrice } from "../lib/formatters";
import type { MetodoEnvio } from "./contratos";

/**
 * El aviso por correo es **best-effort**, igual que en `app/api/leads/route.ts`.
 *
 * La notificación durable de verdad es la fila en `orders`: si el correo no sale, el
 * pedido sigue ahí y el panel lo enseña. Por eso esto nunca lanza y nunca revierte.
 */
export type DatosNotificacionPedido = {
  reference: string;
  metodoEnvio: MetodoEnvio;
  subtotalCents: number;
  totalCents: number | null;
  itemsCount: number;
  destinatario: string;
  departamentoCodigo: string;
  municipioCodigo: string;
};

export type RegistroEscalar = Record<string, string | number | boolean>;

export type DependenciasNotificacion = {
  enviarCorreo: (opciones: { para: string; asunto: string; cuerpoHtml: string }) => Promise<{ ok: boolean; id?: string }>;
  correoAdmin: string;
  apiKeyPresente: boolean;
  registrarLog: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
};

export async function notificarNuevoPedido(
  datos: DatosNotificacionPedido,
  deps: DependenciasNotificacion,
): Promise<boolean> {
  const { reference, metodoEnvio, subtotalCents, totalCents, itemsCount, destinatario, departamentoCodigo, municipioCodigo } = datos;

  if (!deps.apiKeyPresente || !deps.correoAdmin) {
    // Solo escalares y nada identificable: ver `los logs no son analítica`.
    deps.registrarLog("info", "notificacion-correo-omitida-sin-credenciales", { reference, metodoEnvio });
    return false;
  }

  const asunto =
    metodoEnvio === "guatex"
      ? `Nueva solicitud de pedido Guatex #${reference}`
      : `Nuevo pedido de mensajero propio #${reference}`;

  const importeTexto =
    totalCents !== null
      ? formatPrice(aQuetzales(totalCents))
      : `${formatPrice(aQuetzales(subtotalCents))} (flete de Guatex pendiente)`;

  const cuerpoHtml = `
    <h2>${asunto}</h2>
    <p><strong>Referencia:</strong> #${reference}</p>
    <p><strong>Destinatario:</strong> ${destinatario}</p>
    <p><strong>Destino:</strong> departamento ${departamentoCodigo}, municipio ${municipioCodigo}</p>
    <p><strong>Artículos:</strong> ${itemsCount}</p>
    <p><strong>Importe:</strong> ${importeTexto}</p>
    <p>Gestiona la entrega en el panel de administración, en /admin/pedidos.</p>
  `;

  try {
    const respuesta = await deps.enviarCorreo({ para: deps.correoAdmin, asunto, cuerpoHtml });
    deps.registrarLog("info", "notificacion-correo-enviada", {
      reference,
      idCorreo: respuesta.id ?? "sin-id",
    });
    return respuesta.ok;
  } catch (error: unknown) {
    deps.registrarLog("error", "notificacion-correo-fallida", {
      reference,
      claseError: error instanceof Error ? error.name : "ErrorDesconocido",
    });
    return false;
  }
}
```

```ts
// app/pedidos/notificacion.server.ts
import "server-only";

import { registrar } from "../lib/datos";
import { notificarNuevoPedido as notificarPuro, type DatosNotificacionPedido } from "./notificacion";

async function enviarConResend(opciones: {
  para: string;
  asunto: string;
  cuerpoHtml: string;
}): Promise<{ ok: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const remitente = process.env.LEADS_EMAIL_FROM;
  if (!apiKey || !remitente) return { ok: false };

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente,
      to: [opciones.para],
      subject: opciones.asunto,
      html: opciones.cuerpoHtml,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend devolvió HTTP ${respuesta.status}`);
  }

  const json = (await respuesta.json()) as { id?: string };
  return { ok: true, id: json.id };
}

export async function notificarNuevoPedido(datos: DatosNotificacionPedido): Promise<boolean> {
  // Se reutilizan las mismas variables que ya usa `/api/leads`: mientras el dominio
  // corporativo lo controle un tercero, no hay remitente verificado y el envío se omite.
  const correoAdmin = process.env.LEADS_EMAIL_TO ?? "";
  const apiKeyPresente = Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.LEADS_EMAIL_FROM);

  return notificarPuro(datos, {
    enviarCorreo: enviarConResend,
    correoAdmin,
    apiKeyPresente,
    registrarLog: (nivel, suceso, escalares) => registrar(nivel, suceso, escalares),
  });
}
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/pedidos-notificacion.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir `tests/pedidos-notificacion.test.ts` a `test:datos`.
  - Ejecutar: `npm run test:datos && npm run typecheck && npm run lint`.

- [ ] **Paso 6: Commit de la tarea 10**
  - Mensaje: `feat(pedidos): aviso administrativo por correo best-effort sin datos personales en el log`

---

### Tarea 11: Validación de entrada, orquestador de checkout, Server Actions e interfaz

**Files:**
- Crear: `app/checkout/validacionEntrada.ts` (módulo puro de validación del formulario)
- Crear: `app/checkout/orquestacion.ts` (módulo funcional puro, sin `server-only`)
- Crear: `app/checkout/checkout.server.ts` (wrapper con `server-only` que inyecta Neon, el proveedor de pago y las funciones de pedidos)
- Crear: `app/checkout/actions.ts`
- Crear: `app/checkout/FormularioCheckout.tsx`
- Crear: `app/checkout/page.tsx`
- Crear: `app/checkout/confirmacion/[referencia]/page.tsx`
- Crear: `tests/checkout-validacion.test.ts`
- Crear: `tests/checkout-orquestador.test.ts`

**Interfaces:**
- En `app/checkout/validacionEntrada.ts`:
  ```ts
  export type EntradaCheckoutValida = {
    idempotencyKey: string;
    direccionGuardadaId?: string;
    direccion: DireccionPedidoInput | null;
    fiscal: { tipo: TipoIdentificacionFiscal; numero: string | null; nombre: string };
  };
  export type ResultadoValidacionEntrada =
    | { ok: true; valor: EntradaCheckoutValida }
    | { ok: false; error: string };
  export function validarEntradaCheckout(
    entrada: Record<string, unknown>,
    catalogoMunicipios: readonly MunicipioCatalogo[],
  ): ResultadoValidacionEntrada;
  ```
- En `app/checkout/orquestacion.ts`:
  ```ts
  export type DependenciasCheckout = {
    crearPedido: (params: ParametrosCreacionPedido) => Promise<ResultadoCrearPedido>;
    proveedorPago: ProveedorPago;
    leerDireccionGuardada?: (direccionId: string, userId: string) => Promise<DireccionPedidoInput | null>;
    notificar?: (datos: DatosNotificacionPedido) => Promise<boolean>;
    registrarLog?: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
  };
  export function procesarCheckout(
    params: ParametrosCheckout,
    deps: DependenciasCheckout,
  ): Promise<ResultadoCheckout>;

  export type DependenciasReintentoPago = {
    proveedorPago: ProveedorPago;
    leerPedidoParaReintento: (reference: string, userId: string) => Promise<PedidoParaReintento | null>;
    registrarLog?: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
  };
  export function reintentarPago(
    params: { reference: string; userId: string },
    deps: DependenciasReintentoPago,
  ): Promise<ResultadoCheckout>;
  ```
  `crearPedido` y `proveedorPago` **son obligatorias**: `crearPedido` realiza la deducción soberana transaccional bajo `FOR SHARE` y devuelve `ResultadoCrearPedido`. Si el método resultante es `mensajero_propio`, `procesarCheckout` llama a `iniciarPago` exclusivamente tras el `COMMIT`. Si el método es `guatex`, jamás se inicia pago y se avisa administrativamente en segundo plano.

- [ ] **Paso 1: Escribir las pruebas unitarias de validación (RED)**

```ts
// tests/checkout-validacion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { validarEntradaCheckout } from "../app/checkout/validacionEntrada";

const MUNICIPIOS = [
  { codigo: "0101", departamento: "01", nombre: "Guatemala" },
  { codigo: "0108", departamento: "01", nombre: "Mixco" },
  { codigo: "0901", departamento: "09", nombre: "Quetzaltenango" },
] as const;

const CLAVE = "3f8b1c2d-4e5a-4b6c-8d9e-0a1b2c3d4e5f";

function entradaCapitalina(extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: CLAVE,
    destinatario: "Ana Pérez",
    telefono: "55554444",
    departamentoCodigo: "01",
    municipioCodigo: "0101",
    zonaCapitalina: "14",
    linea1: "Avenida Reforma 1-00",
    referencias: "Portón verde",
    fiscalTipo: "cf",
    fiscalNombre: "Ana Pérez",
    ...extra,
  };
}

test("acepta una entrada válida completa para la capital", () => {
  const resultado = validarEntradaCheckout(entradaCapitalina(), MUNICIPIOS);
  assert.equal(resultado.ok, true);
  if (!resultado.ok) throw new Error("Fallo: resultado debe ser ok");
  assert.equal(resultado.valor.direccion?.zonaCapitalina, 14);
  assert.equal(resultado.valor.fiscal.tipo, "cf");
  assert.equal(resultado.valor.fiscal.numero, null);
});

test("rechaza la capital sin zona capitalina", () => {
  const resultado = validarEntradaCheckout(entradaCapitalina({ zonaCapitalina: "" }), MUNICIPIOS);
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /zona capitalina/i);
});

test("ignora la zona fuera de la capital y la rechaza si se envía", () => {
  const resultado = validarEntradaCheckout(
    entradaCapitalina({ departamentoCodigo: "01", municipioCodigo: "0108", zonaCapitalina: "1" }),
    MUNICIPIOS,
  );
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /solo aplica al municipio de Guatemala/i);
});

test("un municipio que no pertenece al departamento se rechaza", () => {
  const resultado = validarEntradaCheckout(
    entradaCapitalina({ departamentoCodigo: "01", municipioCodigo: "0901" }),
    MUNICIPIOS,
  );
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /no pertenece/i);
});

test("el teléfono debe tener 8 dígitos exactos", () => {
  for (const tel of ["1234567", "123456789", "5555abcd"]) {
    const resultado = validarEntradaCheckout(entradaCapitalina({ telefono: tel }), MUNICIPIOS);
    assert.equal(resultado.ok, false, `Debe rechazar ${tel}`);
  }
});

test("NIT exige número; CF no", () => {
  const sinNumero = validarEntradaCheckout(
    entradaCapitalina({ fiscalTipo: "nit", fiscalNumero: "" }),
    MUNICIPIOS,
  );
  assert.equal(sinNumero.ok, false);
  if (sinNumero.ok) throw new Error("Fallo: sinNumero no debe ser ok");
  assert.match(sinNumero.error, /número de NIT es obligatorio/i);

  const conNumero = validarEntradaCheckout(
    entradaCapitalina({ fiscalTipo: "nit", fiscalNumero: "1234567-K" }),
    MUNICIPIOS,
  );
  assert.equal(conNumero.ok, true);
});

test("con dirección guardada no se exige dirección nueva", () => {
  const resultado = validarEntradaCheckout(
    {
      idempotencyKey: CLAVE,
      direccionGuardadaId: "12",
      fiscalTipo: "cf",
      fiscalNombre: "Ana Pérez",
    },
    MUNICIPIOS,
  );
  assert.equal(resultado.ok, true);
  if (!resultado.ok) throw new Error("Fallo: resultado debe ser ok");
  assert.equal(resultado.valor.direccionGuardadaId, "12");
  assert.equal(resultado.valor.direccion, null);
});

test("el identificador de dirección guardada debe ser un entero positivo", () => {
  for (const idInvalido of ["abc", "-1", "0", "1.5"]) {
    const resultado = validarEntradaCheckout(
      {
        idempotencyKey: CLAVE,
        direccionGuardadaId: idInvalido,
        fiscalTipo: "cf",
        fiscalNombre: "Ana",
      },
      MUNICIPIOS,
    );
    assert.equal(resultado.ok, false);
  }
});
```

- [ ] **Paso 2: Escribir las pruebas unitarias del orquestador (RED)**

```ts
// tests/checkout-orquestador.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  procesarCheckout,
  reintentarPago,
  type DependenciasCheckout,
} from "../app/checkout/orquestacion";
import type { DatosNotificacionPedido } from "../app/pedidos/notificacion";
import type {
  ParametrosCheckout,
  PedidoCreado,
  ResultadoCrearPedido,
} from "../app/pedidos/contratos";

const DIRECCION_ZONA_1 = {
  destinatario: "Ana Pérez",
  telefono: "55554444",
  departamentoCodigo: "01",
  municipioCodigo: "0101",
  zonaCapitalina: 1,
  linea1: "1a Calle 1-00",
  referencias: null,
} as const;

const PEDIDO_MENSAJERO: PedidoCreado = {
  orderId: "ord-1",
  reference: "EC-2K7M9P4XBW",
  status: "pendiente_de_pago",
  shippingMethod: "mensajero_propio",
  shippingCostCents: 3500,
  subtotalCents: 10000,
  totalCents: 13500,
  itemsCount: 1,
};

const PEDIDO_GUATEX: PedidoCreado = {
  orderId: "ord-gtx",
  reference: "EC-9WKD3PZ7MB",
  status: "pendiente_de_contacto",
  shippingMethod: "guatex",
  shippingCostCents: null,
  subtotalCents: 15000,
  totalCents: null,
  itemsCount: 3,
};

function parametros(extra: Partial<ParametrosCheckout> = {}): ParametrosCheckout {
  return {
    clienteId: "42",
    idempotencyKey: "3f8b1c2d-4e5a-4b6c-8d9e-0a1b2c3d4e5f",
    checkoutActivo: true,
    direccion: { ...DIRECCION_ZONA_1 },
    datosFiscales: { tipo: "cf", numero: null, nombre: "Ana Pérez" },
    ...extra,
  };
}

function deps(extra: Partial<DependenciasCheckout> = {}): DependenciasCheckout {
  return {
    crearPedido: async (): Promise<ResultadoCrearPedido> => ({ ok: true, pedido: PEDIDO_MENSAJERO }),
    proveedorPago: {
      estaConfigurado: () => true,
      iniciarPago: async () => ({ urlPago: "https://pasarela.example/pago/123", transaccionId: "trx-1" }),
    },
    ...extra,
  };
}

test("con el checkout apagado no se crea ningún pedido", async () => {
  let creado = false;
  const resultado = await procesarCheckout(
    parametros({ checkoutActivo: false }),
    deps({
      crearPedido: async () => {
        creado = true;
        return { ok: true, pedido: PEDIDO_MENSAJERO };
      },
    }),
  );

  assert.equal(resultado.ok, false);
  assert.equal(creado, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /no está disponible temporalmente/i);
});

test("a) zona configurada como mensajero propio pero pasarela no configurada: aborta transaccionalmente con PAGO_NO_DISPONIBLE", async () => {
  let inicioPagoInvocado = false;
  let notificacionInvocada = false;

  const resultado = await procesarCheckout(
    parametros(),
    deps({
      crearPedido: async () => ({
        ok: false,
        codigo: "PAGO_NO_DISPONIBLE",
        error: "El pago en línea no está disponible en este momento, así que no hemos creado el pedido ni tocado tu carrito. Escríbenos por WhatsApp y lo cerramos contigo.",
      }),
      proveedorPago: {
        estaConfigurado: () => false,
        iniciarPago: async () => {
          inicioPagoInvocado = true;
          return { urlPago: "https://ejemplo", transaccionId: "t" };
        },
      },
      notificar: async () => {
        notificacionInvocada = true;
        return true;
      },
    }),
  );

  assert.equal(resultado.ok, false);
  assert.equal(inicioPagoInvocado, false, "Jamás invoca iniciarPago si la creación falló");
  assert.equal(notificacionInvocada, false, "No notifica si la creación falló");
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /pago en línea no está disponible/i);
});

test("b) orden temporal estricto: el pedido se confirma antes de llamar a la pasarela", async () => {
  const pasos: string[] = [];

  const resultado = await procesarCheckout(
    parametros(),
    deps({
      proveedorPago: {
        estaConfigurado: () => true,
        iniciarPago: async (pedido) => {
          pasos.push(`iniciarPago:${pedido.reference}`);
          return { urlPago: `https://pasarela.example/pago/${pedido.reference}`, transaccionId: "trx-1" };
        },
      },
      crearPedido: async (p) => {
        pasos.push(`crearPedido:${p.idempotencyKey}`);
        return { ok: true, pedido: PEDIDO_MENSAJERO };
      },
      notificar: async () => true,
    }),
  );

  assert.equal(resultado.ok, true);
  if (!resultado.ok) throw new Error("Fallo: resultado debe ser ok");
  assert.equal(resultado.urlPago, "https://pasarela.example/pago/EC-2K7M9P4XBW");
  assert.equal(resultado.metodoEnvio, "mensajero_propio");
  assert.deepEqual(pasos, [
    "crearPedido:3f8b1c2d-4e5a-4b6c-8d9e-0a1b2c3d4e5f",
    "iniciarPago:EC-2K7M9P4XBW",
  ]);
});

test("b) un fallo de la pasarela tras el COMMIT conserva el pedido y devuelve operación recuperable", async () => {
  const resultado = await procesarCheckout(
    parametros(),
    deps({
      crearPedido: async () => ({ ok: true, pedido: PEDIDO_MENSAJERO }),
      proveedorPago: {
        estaConfigurado: () => true,
        iniciarPago: async () => { throw new Error("Tiempo agotado en la pasarela bancaria"); },
      },
    }),
  );

  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.equal(resultado.recuperable, true);
  assert.equal(resultado.reference, "EC-2K7M9P4XBW");
  assert.match(resultado.error, /reintentar el pago sin duplicar/i);
});

test("c) pedido previo existente por clave de idempotencia recupera el pedido guardado según su propio shipping_method", async () => {
  const resultado = await procesarCheckout(
    parametros({ idempotencyKey: "idem-reintento-1" }),
    deps({
      crearPedido: async () => ({ ok: true, pedido: PEDIDO_GUATEX }),
      proveedorPago: {
        estaConfigurado: () => false, // Solicitud Guatex no requiere pasarela
        iniciarPago: async () => { throw new Error("no debe llamarse"); },
      },
    }),
  );

  assert.equal(resultado.ok, true);
  if (!resultado.ok) throw new Error("Fallo: resultado debe ser ok");
  assert.equal(resultado.metodoEnvio, "guatex");
  assert.equal(resultado.reference, "EC-9WKD3PZ7MB");
});

test("d) solicitud Guatex: se crea transaccionalmente y jamás invoca iniciarPago", async () => {
  let inicioPagoLlamado = false;
  const notificaciones: DatosNotificacionPedido[] = [];

  const resultado = await procesarCheckout(
    parametros({ direccion: { ...DIRECCION_ZONA_1, zonaCapitalina: 17 } }),
    deps({
      crearPedido: async () => ({ ok: true, pedido: PEDIDO_GUATEX }),
      proveedorPago: {
        estaConfigurado: () => false,
        iniciarPago: async () => {
          inicioPagoLlamado = true;
          return { urlPago: "https://ejemplo", transaccionId: "t" };
        },
      },
      notificar: async (datos) => {
        notificaciones.push(datos);
        return true;
      },
    }),
  );

  assert.equal(resultado.ok, true);
  assert.equal(inicioPagoLlamado, false, "Guatex jamás invoca iniciarPago");
  if (!resultado.ok) throw new Error("Fallo: resultado debe ser ok");
  assert.equal(resultado.metodoEnvio, "guatex");
  assert.equal(resultado.reference, "EC-9WKD3PZ7MB");
  assert.equal(notificaciones.length, 1);
  assert.equal(notificaciones[0]?.itemsCount, 3);
  assert.equal(notificaciones[0]?.reference, "EC-9WKD3PZ7MB");
});

test("una dirección guardada ajena se rechaza sin crear pedido", async () => {
  let creado = false;
  const resultado = await procesarCheckout(
    parametros({ direccionGuardadaId: "999", direccion: null }),
    deps({
      leerDireccionGuardada: async () => null,
      crearPedido: async () => {
        creado = true;
        return { ok: true, pedido: PEDIDO_MENSAJERO };
      },
    }),
  );

  assert.equal(resultado.ok, false);
  assert.equal(creado, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.match(resultado.error, /no te pertenece/i);
});

test("el reintento reutiliza el pedido existente y no crea ninguno nuevo", async () => {
  const consultas: Array<{ reference: string; userId: string }> = [];

  const resultado = await reintentarPago(
    { reference: "EC-2K7M9P4XBW", userId: "42" },
    {
      proveedorPago: {
        estaConfigurado: () => true,
        iniciarPago: async (pedido) => ({
          urlPago: `https://pasarela.example/pago/${pedido.reference}`,
          transaccionId: "trx-2",
        }),
      },
      leerPedidoParaReintento: async (reference, userId) => {
        consultas.push({ reference, userId });
        return {
          orderId: "ord-1",
          reference: "EC-2K7M9P4XBW",
          status: "pendiente_de_pago",
          shippingMethod: "mensajero_propio",
          totalCents: 13500,
        };
      },
    },
  );

  assert.equal(resultado.ok, true);
  assert.deepEqual(consultas, [{ reference: "EC-2K7M9P4XBW", userId: "42" }]);
});

test("el reintento falla amistosamente si la pasarela no responde", async () => {
  const resultado = await reintentarPago(
    { reference: "EC-2K7M9P4XBW", userId: "42" },
    {
      proveedorPago: {
        estaConfigurado: () => true,
        iniciarPago: async () => { throw new Error("Tiempo agotado"); },
      },
      leerPedidoParaReintento: async () => ({
        orderId: "ord-1",
        reference: "EC-2K7M9P4XBW",
        status: "pendiente_de_pago",
        shippingMethod: "mensajero_propio",
        totalCents: 13500,
      }),
    },
  );

  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("Fallo: resultado no debe ser ok");
  assert.equal(resultado.recuperable, true);
  assert.equal(resultado.reference, "EC-2K7M9P4XBW");
});
```

- [ ] **Paso 3: Ejecutar las dos pruebas y comprobar que fallan (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/checkout-validacion.test.ts tests/checkout-orquestador.test.ts`

- [ ] **Paso 4: Escribir la implementación completa (GREEN)**

```ts
// app/checkout/validacionEntrada.ts
import type { MunicipioCatalogo } from "../envios/geografia";
import { esZonaCapitalinaValida } from "../envios/zonasCapitalinas";
import type { DireccionPedidoInput, TipoIdentificacionFiscal } from "../pedidos/contratos";

/**
 * Toda la entrada del formulario se valida aquí, **antes de cualquier mutación**.
 *
 * El módulo es puro y recibe el catálogo geográfico como parámetro: así se prueba sin
 * cargar el JSON de 340 municipios y sin arrastrar `server-only`.
 *
 * El identificador de dirección guardada se valida como **entero positivo**, no como
 * UUID: `user_addresses.id` es `bigserial` (`db/009_identidad_clientes.sql`). La
 * pertenencia al cliente no se comprueba aquí —eso es una consulta—, sino en
 * `leerDireccionGuardada`, que filtra por `id` y `user_id` a la vez.
 */
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGEX_ID_DIRECCION = /^[1-9][0-9]{0,18}$/;
const TIPOS_FISCALES: readonly TipoIdentificacionFiscal[] = ["cf", "nit", "cui"];

export type EntradaCheckoutValida = {
  idempotencyKey: string;
  direccionGuardadaId?: string;
  direccion: DireccionPedidoInput | null;
  fiscal: { tipo: TipoIdentificacionFiscal; numero: string | null; nombre: string };
};

export type ResultadoValidacionEntrada =
  | { ok: true; valor: EntradaCheckoutValida }
  | { ok: false; error: string };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function validarEntradaCheckout(
  entrada: Record<string, unknown>,
  catalogoMunicipios: readonly MunicipioCatalogo[],
): ResultadoValidacionEntrada {
  const idempotencyKey = texto(entrada.idempotencyKey);
  if (!REGEX_UUID.test(idempotencyKey)) {
    return { ok: false, error: "El identificador de la operación no es válido. Vuelve a cargar el checkout." };
  }

  // Fiscalidad: tipo cerrado y número obligatorio salvo en Consumidor Final.
  const tipoCrudo = texto(entrada.fiscalTipo);
  if (!(TIPOS_FISCALES as readonly string[]).includes(tipoCrudo)) {
    return { ok: false, error: "El tipo de identificación fiscal no es válido." };
  }
  const fiscalTipo = tipoCrudo as TipoIdentificacionFiscal;
  const fiscalNumero = texto(entrada.fiscalNumero);
  if (fiscalTipo !== "cf" && !fiscalNumero) {
    return { ok: false, error: `El número de ${fiscalTipo.toUpperCase()} es obligatorio.` };
  }
  const fiscalNombre = texto(entrada.fiscalNombre);
  if (!fiscalNombre) {
    return { ok: false, error: "El nombre para facturación es obligatorio." };
  }
  const fiscal = {
    tipo: fiscalTipo,
    numero: fiscalTipo === "cf" ? null : fiscalNumero,
    nombre: fiscalNombre,
  };

  // Camino 1: dirección ya guardada. No se acepta ninguna dirección nueva a la vez.
  const direccionGuardadaId = texto(entrada.direccionGuardadaId);
  if (direccionGuardadaId) {
    if (!REGEX_ID_DIRECCION.test(direccionGuardadaId)) {
      return { ok: false, error: "La dirección seleccionada no es válida." };
    }
    return { ok: true, valor: { idempotencyKey, direccionGuardadaId, direccion: null, fiscal } };
  }

  // Camino 2: dirección nueva, campo a campo.
  const destinatario = texto(entrada.destinatario);
  if (!destinatario) {
    return { ok: false, error: "El nombre de quien recibe es obligatorio." };
  }

  const telefono = texto(entrada.telefono);
  if (!/^[0-9]{8}$/.test(telefono)) {
    return { ok: false, error: "El teléfono debe contener exactamente 8 dígitos." };
  }

  const departamentoCodigo = texto(entrada.departamentoCodigo);
  if (!/^[0-9]{2}$/.test(departamentoCodigo)) {
    return { ok: false, error: "El código de departamento no es válido." };
  }

  const municipioCodigo = texto(entrada.municipioCodigo);
  if (!/^[0-9]{4}$/.test(municipioCodigo)) {
    return { ok: false, error: "El código de municipio no es válido." };
  }

  // La relación geográfica se comprueba contra el catálogo oficial, no por prefijo:
  // que el código empiece por el del departamento no prueba que el municipio exista.
  const municipio = catalogoMunicipios.find(
    (m) => m.codigo === municipioCodigo && m.departamento === departamentoCodigo,
  );
  if (!municipio) {
    return { ok: false, error: "El municipio seleccionado no pertenece a ese departamento." };
  }

  const zonaCruda = texto(entrada.zonaCapitalina);
  const esCapital = departamentoCodigo === "01" && municipioCodigo === "0101";
  let zonaCapitalina: number | null = null;

  if (esCapital) {
    if (!/^[0-9]{1,2}$/.test(zonaCruda)) {
      return { ok: false, error: "Selecciona la zona capitalina: es obligatoria en el municipio de Guatemala." };
    }
    const zona = Number(zonaCruda);
    if (!esZonaCapitalinaValida(zona)) {
      return { ok: false, error: "Esa zona capitalina no existe. Las válidas son de la 1 a la 19, la 21, la 24 y la 25." };
    }
    zonaCapitalina = zona;
  } else if (zonaCruda) {
    return { ok: false, error: "La zona capitalina solo aplica al municipio de Guatemala." };
  }

  const linea1 = texto(entrada.linea1);
  if (!linea1) {
    return { ok: false, error: "La dirección completa es obligatoria." };
  }

  const referencias = texto(entrada.referencias);

  return {
    ok: true,
    valor: {
      idempotencyKey,
      direccion: {
        destinatario,
        telefono,
        departamentoCodigo,
        municipioCodigo,
        zonaCapitalina,
        linea1,
        referencias: referencias || null,
      },
      fiscal,
    },
  };
}
```

```ts
// app/checkout/orquestacion.ts
import type { DatosNotificacionPedido, RegistroEscalar } from "../pedidos/notificacion";
import type { ProveedorPago } from "../pedidos/pago";
import type {
  DireccionPedidoInput,
  EstadoPedido,
  MetodoEnvio,
  ParametrosCheckout,
  ParametrosCreacionPedido,
  PedidoCreado,
  ResultadoCheckout,
  ResultadoCrearPedido,
} from "../pedidos/contratos";

/**
 * El orquestador del checkout, sin `server-only` y con todas sus dependencias
 * inyectadas: se prueba entero con dobles y sin base de datos.
 *
 * `crearPedido` y `proveedorPago` son obligatorias. La deducción soberana transaccional
 * vive dentro de `crearPedido` bajo bloqueo `FOR SHARE`. Si es `mensajero_propio`,
 * `crearPedido` comprueba la pasarela de forma síncrona dentro de la transacción y devuelve
 * `ResultadoCrearPedido` como valor discriminado.
 * El orquestador ejecuta `iniciarPago` exclusivamente tras el `COMMIT` para pedidos propios,
 * y jamás lo ejecuta para solicitudes `guatex`.
 */
export type DependenciasCheckout = {
  crearPedido: (params: ParametrosCreacionPedido) => Promise<ResultadoCrearPedido>;
  proveedorPago: ProveedorPago;
  leerDireccionGuardada?: (direccionId: string, userId: string) => Promise<DireccionPedidoInput | null>;
  notificar?: (datos: DatosNotificacionPedido) => Promise<boolean>;
  registrarLog?: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
};

export type PedidoParaReintento = {
  orderId: string;
  reference: string;
  status: EstadoPedido;
  shippingMethod: MetodoEnvio;
  totalCents: number | null;
};

export type DependenciasReintentoPago = {
  proveedorPago: ProveedorPago;
  leerPedidoParaReintento: (reference: string, userId: string) => Promise<PedidoParaReintento | null>;
  registrarLog?: (nivel: "info" | "error", suceso: string, datos?: RegistroEscalar) => void;
};

async function avisar(
  deps: DependenciasCheckout,
  pedido: PedidoCreado,
  direccion: DireccionPedidoInput,
): Promise<void> {
  if (!deps.notificar) return;
  try {
    await deps.notificar({
      reference: pedido.reference,
      metodoEnvio: pedido.shippingMethod,
      subtotalCents: pedido.subtotalCents,
      totalCents: pedido.totalCents,
      itemsCount: pedido.itemsCount,
      destinatario: direccion.destinatario,
      departamentoCodigo: direccion.departamentoCodigo,
      municipioCodigo: direccion.municipioCodigo,
    });
  } catch {
    // Un aviso fallido nunca cancela un pedido ya confirmado.
    deps.registrarLog?.("error", "notificacion-pedido-fallida", { reference: pedido.reference });
  }
}

export async function procesarCheckout(
  params: ParametrosCheckout,
  deps: DependenciasCheckout,
): Promise<ResultadoCheckout> {
  const { clienteId, idempotencyKey, checkoutActivo, datosFiscales, direccionGuardadaId } = params;
  const registrarLog = deps.registrarLog ?? (() => {});

  if (!checkoutActivo) {
    return { ok: false, error: "El servicio de compra no está disponible temporalmente." };
  }

  // 1. Resolver la dirección definitiva. Una dirección guardada solo vale si es del
  //    cliente autenticado: `leerDireccionGuardada` filtra por id y por user_id.
  let direccionFinal: DireccionPedidoInput | null = params.direccion;
  if (direccionGuardadaId) {
    if (!deps.leerDireccionGuardada) {
      return { ok: false, error: "El servicio de direcciones no está disponible." };
    }
    const guardada = await deps.leerDireccionGuardada(direccionGuardadaId, clienteId);
    if (!guardada) {
      return { ok: false, error: "La dirección seleccionada no es válida o no te pertenece." };
    }
    direccionFinal = guardada;
  }

  if (!direccionFinal) {
    return { ok: false, error: "Falta la dirección de entrega." };
  }

  // 2. Crear el pedido transaccionalmente.
  //    La transacción de crearPedido realiza el bloqueo de carts, consulta de idempotencia previa,
  //    lectura bajo FOR SHARE de app_settings, bloqueo de cart_items, deducción soberana del método
  //    y comprobación síncrona de disponibilidad de pasarela si resulta mensajero_propio.
  //    Si la pasarela no está configurada, crearPedido finaliza sin mutaciones y devuelve
  //    { ok: false, codigo: "PAGO_NO_DISPONIBLE", error: ... }.
  let resCreacion: ResultadoCrearPedido;
  try {
    resCreacion = await deps.crearPedido({
      userId: clienteId,
      idempotencyKey,
      fiscal: datosFiscales,
      direccion: direccionFinal,
    });
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo procesar el pedido." };
  }

  if (!resCreacion.ok) {
    return { ok: false, error: resCreacion.error };
  }

  const pedido = resCreacion.pedido;

  // 3. Después del COMMIT (la transacción ya terminó).
  //    Si el método deducido es mensajero_propio, se inicia el pago con tarjeta.
  //    Si es guatex, JAMÁS se inicia pago con tarjeta.
  if (pedido.shippingMethod === "mensajero_propio") {
    if (pedido.totalCents === null) {
      registrarLog("error", "pedido-propio-sin-total", { reference: pedido.reference });
      return {
        ok: false,
        recuperable: true,
        reference: pedido.reference,
        error: "El pedido quedó registrado pero su importe no está completo. Escríbenos por WhatsApp con tu referencia.",
      };
    }

    try {
      const inicio = await deps.proveedorPago.iniciarPago({
        orderId: pedido.orderId,
        reference: pedido.reference,
        totalCents: pedido.totalCents,
      });
      await avisar(deps, pedido, direccionFinal);
      return {
        ok: true,
        reference: pedido.reference,
        status: pedido.status,
        metodoEnvio: "mensajero_propio",
        urlPago: inicio.urlPago,
      };
    } catch {
      registrarLog("error", "pago-inicio-fallido", { reference: pedido.reference });
      return {
        ok: false,
        recuperable: true,
        reference: pedido.reference,
        error:
          "Tu pedido quedó registrado, pero no pudimos conectar con la pasarela bancaria. Puedes reintentar el pago sin duplicar el pedido.",
      };
    }
  }

  // Solicitud Guatex: jamás invoca iniciarPago.
  await avisar(deps, pedido, direccionFinal);
  return {
    ok: true,
    reference: pedido.reference,
    status: pedido.status,
    metodoEnvio: "guatex",
  };
}

/**
 * Reintento del cobro de un pedido ya creado.
 *
 * Recupera el pedido por `reference` **y** `user_id`, exige que siga en
 * `pendiente_de_pago` y sea de `mensajero_propio`, y reutiliza esa fila. No crea
 * ningún pedido nuevo ni acepta una clave de idempotencia distinta, así que no
 * puede abrir un segundo cobro por la misma compra.
 */
export async function reintentarPago(
  params: { reference: string; userId: string },
  deps: DependenciasReintentoPago,
): Promise<ResultadoCheckout> {
  const pedido = await deps.leerPedidoParaReintento(params.reference, params.userId);

  if (
    !pedido ||
    pedido.status !== "pendiente_de_pago" ||
    pedido.shippingMethod !== "mensajero_propio" ||
    pedido.totalCents === null
  ) {
    return { ok: false, error: "Ese pedido no admite un reintento de pago." };
  }

  if (!deps.proveedorPago.estaConfigurado()) {
    return {
      ok: false,
      recuperable: true,
      reference: pedido.reference,
      error: "La pasarela de pago sigue sin estar disponible. Tu pedido está guardado y puedes reintentarlo más tarde.",
    };
  }

  try {
    const inicio = await deps.proveedorPago.iniciarPago({
      orderId: pedido.orderId,
      reference: pedido.reference,
      totalCents: pedido.totalCents,
    });
    return {
      ok: true,
      reference: pedido.reference,
      status: pedido.status,
      metodoEnvio: "mensajero_propio",
      urlPago: inicio.urlPago,
    };
  } catch {
    deps.registrarLog?.("error", "pago-reintento-fallido", { reference: pedido.reference });
    return {
      ok: false,
      recuperable: true,
      reference: pedido.reference,
      error: "No pudimos conectar con la pasarela bancaria. Tu pedido sigue guardado: vuelve a intentarlo.",
    };
  }
}
```

```ts
// app/checkout/checkout.server.ts
import "server-only";

import { leer, registrar } from "../lib/datos";
import { crearPedidoTransaccional } from "../pedidos/pedidos.server";
import { notificarNuevoPedido } from "../pedidos/notificacion.server";
import { proveedorPagoSinConfigurar } from "../pedidos/pago";
import {
  procesarCheckout as procesarCheckoutPuro,
  reintentarPago as reintentarPagoPuro,
  type PedidoParaReintento,
} from "./orquestacion";
import type {
  DireccionPedidoInput,
  EstadoPedido,
  MetodoEnvio,
  ParametrosCheckout,
  ResultadoCheckout,
} from "../pedidos/contratos";

const proveedorPago = proveedorPagoSinConfigurar;

type FilaDireccionGuardada = {
  destinatario: string;
  telefono: string;
  departamento_codigo: string | null;
  municipio_codigo: string | null;
  zona_capitalina: number | null;
  direccion: string;
  referencias: string | null;
};

async function leerDireccionGuardada(
  direccionId: string,
  userId: string,
): Promise<DireccionPedidoInput | null> {
  // Anti-IDOR: el filtro por `user_id` va en la misma consulta, no en una
  // comprobación posterior que alguien pueda olvidar.
  const filas = await leer<FilaDireccionGuardada>(
    `select destinatario, telefono, departamento_codigo, municipio_codigo,
            zona_capitalina, direccion, referencias
       from user_addresses
      where id = $1 and user_id = $2`,
    [direccionId, userId],
  );

  const fila = filas[0];
  if (!fila || !fila.departamento_codigo || !fila.municipio_codigo) {
    // Una dirección histórica sin códigos INE no sirve para calcular el envío.
    return null;
  }

  return {
    destinatario: fila.destinatario,
    telefono: fila.telefono,
    departamentoCodigo: fila.departamento_codigo,
    municipioCodigo: fila.municipio_codigo,
    zonaCapitalina: fila.zona_capitalina,
    linea1: fila.direccion,
    referencias: fila.referencias || null,
  };
}

async function leerPedidoParaReintento(
  reference: string,
  userId: string,
): Promise<PedidoParaReintento | null> {
  const filas = await leer<{
    id: string;
    reference: string;
    status: string;
    shipping_method: string;
    total_cents: number | null;
  }>(
    `select id, reference, status, shipping_method, total_cents
       from orders
      where reference = $1 and user_id = $2`,
    [reference, userId],
  );

  const fila = filas[0];
  if (!fila) return null;

  return {
    orderId: fila.id,
    reference: fila.reference,
    status: fila.status as EstadoPedido,
    shippingMethod: fila.shipping_method as MetodoEnvio,
    totalCents: fila.total_cents,
  };
}

export async function procesarCheckout(params: ParametrosCheckout): Promise<ResultadoCheckout> {
  return procesarCheckoutPuro(params, {
    crearPedido: crearPedidoTransaccional,
    proveedorPago,
    leerDireccionGuardada,
    notificar: notificarNuevoPedido,
    registrarLog: registrar,
  });
}

export async function reintentarPagoPedido(reference: string, userId: string): Promise<ResultadoCheckout> {
  return reintentarPagoPuro(
    { reference, userId },
    { proveedorPago, leerPedidoParaReintento, registrarLog: registrar },
  );
}
```



```ts
// app/checkout/actions.ts
"use server";

import { redirect } from "next/navigation";
import geografia from "@/db/datos/geografia-gt.json";
import { leerClienteActual } from "../identidad/sesion.server";
import { obtenerCheckoutActivo } from "../lib/ajustes.server";
import { esReferenciaValida } from "../pedidos/referencia";
import { procesarCheckout, reintentarPagoPedido } from "./checkout.server";
import { validarEntradaCheckout } from "./validacionEntrada";
import type { ResultadoCheckout } from "../pedidos/contratos";

function aObjeto(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

export async function procesarCheckoutAction(formData: FormData): Promise<ResultadoCheckout> {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar?redirigir=/checkout");
  }

  // Toda la validación ocurre antes de cualquier mutación.
  const validacion = validarEntradaCheckout(aObjeto(formData), geografia.municipios);
  if (!validacion.ok) {
    return { ok: false, error: validacion.error };
  }

  const checkoutActivo = await obtenerCheckoutActivo();
  const entrada = validacion.valor;

  const resultado = await procesarCheckout({
    clienteId: cliente.id,
    idempotencyKey: entrada.idempotencyKey,
    checkoutActivo,
    datosFiscales: entrada.fiscal,
    direccion: entrada.direccion,
    direccionGuardadaId: entrada.direccionGuardadaId ?? undefined,
  });

  if (resultado.ok) {
    if (resultado.urlPago) {
      redirect(resultado.urlPago);
    }
    redirect(`/checkout/confirmacion/${resultado.reference}`);
  }

  return resultado;
}

export async function reintentarPagoAction(formData: FormData): Promise<ResultadoCheckout> {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar?redirigir=/checkout");
  }

  const reference = String(formData.get("reference") ?? "").trim();
  if (!esReferenciaValida(reference)) {
    return { ok: false, error: "La referencia del pedido no es válida." };
  }

  // La titularidad se comprueba dentro: la consulta filtra por reference y user_id.
  const resultado = await reintentarPagoPedido(reference, cliente.id);
  if (resultado.ok && resultado.urlPago) {
    redirect(resultado.urlPago);
  }
  return resultado;
}
```

```tsx
// app/checkout/FormularioCheckout.tsx
"use client";

import { useState, useTransition, type FormEvent } from "react";
import { procesarCheckoutAction, reintentarPagoAction } from "./actions";
import { ZONAS_CAPITALINAS_VALIDAS } from "../envios/zonasCapitalinas";
import type { DireccionGuardadaDto } from "../pedidos/contratos";

type Props = {
  idempotencyKey: string;
  direccionesGuardadas: readonly DireccionGuardadaDto[];
  departamentos: readonly { codigo: string; nombre: string }[];
  municipios: readonly { codigo: string; nombre: string; departamento: string }[];
};

export function FormularioCheckout({
  idempotencyKey,
  direccionesGuardadas,
  departamentos,
  municipios,
}: Props) {
  const [usarGuardada, setUsarGuardada] = useState(direccionesGuardadas.length > 0);
  const [departamento, setDepartamento] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [tipoFiscal, setTipoFiscal] = useState<"cf" | "nit" | "cui">("cf");
  const [error, setError] = useState<string | null>(null);
  const [referenciaRecuperable, setReferenciaRecuperable] = useState<string | null>(null);
  const [enCurso, iniciarTransicion] = useTransition();

  const municipiosDelDepartamento = municipios.filter((m) => m.departamento === departamento);
  const esCapital = departamento === "01" && municipio === "0101";

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);
    setReferenciaRecuperable(null);
    const datos = new FormData(evento.currentTarget);
    if (usarGuardada) {
      // Con dirección guardada no se envían los campos de dirección nueva.
      for (const campo of ["destinatario", "telefono", "departamentoCodigo", "municipioCodigo", "zonaCapitalina", "linea1", "referencias"]) {
        datos.delete(campo);
      }
    } else {
      datos.delete("direccionGuardadaId");
    }

    iniciarTransicion(async () => {
      const resultado = await procesarCheckoutAction(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        if (resultado.recuperable && resultado.reference) {
          setReferenciaRecuperable(resultado.reference);
        }
      }
    });
  };

  const reintentar = () => {
    if (!referenciaRecuperable) return;
    const datos = new FormData();
    datos.set("reference", referenciaRecuperable);
    iniciarTransicion(async () => {
      const resultado = await reintentarPagoAction(datos);
      if (!resultado.ok) {
        setError(resultado.error);
      }
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-8">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {error && (
        <div role="alert" className="space-y-3 rounded border-l-4 border-[#E11133] bg-neutral-50 p-4 text-sm text-neutral-800">
          <p>{error}</p>
          {referenciaRecuperable && (
            <button
              type="button"
              onClick={reintentar}
              disabled={enCurso}
              className="inline-flex items-center rounded bg-[#001B59] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reintentar pago del pedido #{referenciaRecuperable}
            </button>
          )}
        </div>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">1. Dirección de entrega</h2>

        {direccionesGuardadas.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="modoDireccion" checked={usarGuardada} onChange={() => setUsarGuardada(true)} />
                <span className="font-medium text-neutral-800">Usar una dirección guardada</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="modoDireccion" checked={!usarGuardada} onChange={() => setUsarGuardada(false)} />
                <span className="font-medium text-neutral-800">Escribir una dirección nueva</span>
              </label>
            </div>

            {usarGuardada && (
              <select
                name="direccionGuardadaId"
                defaultValue={direccionesGuardadas[0]?.id ?? ""}
                className="w-full rounded-md border border-neutral-300 bg-white p-2.5"
              >
                {direccionesGuardadas.map((direccion) => (
                  <option key={direccion.id} value={direccion.id}>
                    {direccion.destinatario} — {direccion.direccion}, {direccion.municipio}, {direccion.departamento}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {(!usarGuardada || direccionesGuardadas.length === 0) && (
          <div className="grid grid-cols-1 gap-4 border-t border-neutral-200 pt-4 md:grid-cols-2">
            <div>
              <label htmlFor="destinatario" className="mb-1 block text-sm font-medium text-neutral-700">Nombre de quien recibe *</label>
              <input id="destinatario" name="destinatario" type="text" required className="w-full rounded-md border border-neutral-300 p-2" />
            </div>
            <div>
              <label htmlFor="telefono" className="mb-1 block text-sm font-medium text-neutral-700">Teléfono (8 dígitos) *</label>
              <input id="telefono" name="telefono" type="tel" required pattern="[0-9]{8}" className="w-full rounded-md border border-neutral-300 p-2" />
            </div>
            <div>
              <label htmlFor="departamentoCodigo" className="mb-1 block text-sm font-medium text-neutral-700">Departamento *</label>
              <select
                id="departamentoCodigo"
                name="departamentoCodigo"
                required
                value={departamento}
                onChange={(evento) => {
                  setDepartamento(evento.target.value);
                  setMunicipio("");
                }}
                className="w-full rounded-md border border-neutral-300 bg-white p-2"
              >
                <option value="">Selecciona departamento</option>
                {departamentos.map((d) => (
                  <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="municipioCodigo" className="mb-1 block text-sm font-medium text-neutral-700">Municipio *</label>
              <select
                id="municipioCodigo"
                name="municipioCodigo"
                required
                value={municipio}
                disabled={!departamento}
                onChange={(evento) => setMunicipio(evento.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white p-2 disabled:bg-neutral-100"
              >
                <option value="">{departamento ? "Selecciona municipio" : "Primero elige departamento"}</option>
                {municipiosDelDepartamento.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                ))}
              </select>
            </div>

            {esCapital && (
              <div className="md:col-span-2">
                <label htmlFor="zonaCapitalina" className="mb-1 block text-sm font-medium text-neutral-700">
                  Zona capitalina (obligatoria en el municipio de Guatemala) *
                </label>
                <select id="zonaCapitalina" name="zonaCapitalina" required className="w-full rounded-md border border-neutral-300 bg-white p-2">
                  <option value="">Selecciona zona</option>
                  {ZONAS_CAPITALINAS_VALIDAS.map((zona) => (
                    <option key={zona} value={zona}>Zona {zona}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label htmlFor="linea1" className="mb-1 block text-sm font-medium text-neutral-700">Dirección completa *</label>
              <input id="linea1" name="linea1" type="text" required placeholder="Avenida, calle, casa, oficina" className="w-full rounded-md border border-neutral-300 p-2" />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="referencias" className="mb-1 block text-sm font-medium text-neutral-700">Referencias de entrega (opcional)</label>
              <input id="referencias" name="referencias" type="text" placeholder="Frente al parque, portón verde" className="w-full rounded-md border border-neutral-300 p-2" />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">2. Facturación SAT</h2>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {(["cf", "nit", "cui"] as const).map((tipo) => (
              <label key={tipo} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="fiscalTipo"
                  value={tipo}
                  checked={tipoFiscal === tipo}
                  onChange={() => setTipoFiscal(tipo)}
                />
                <span>{tipo === "cf" ? "Consumidor Final (CF)" : tipo === "nit" ? "NIT" : "CUI (DPI)"}</span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tipoFiscal !== "cf" && (
              <div>
                <label htmlFor="fiscalNumero" className="mb-1 block text-sm font-medium text-neutral-700">
                  Número de {tipoFiscal.toUpperCase()} *
                </label>
                <input
                  id="fiscalNumero"
                  name="fiscalNumero"
                  type="text"
                  required
                  placeholder={tipoFiscal === "nit" ? "Ej. 1234567-K" : "13 dígitos"}
                  className="w-full rounded-md border border-neutral-300 p-2"
                />
              </div>
            )}
            <div className={tipoFiscal === "cf" ? "md:col-span-2" : ""}>
              <label htmlFor="fiscalNombre" className="mb-1 block text-sm font-medium text-neutral-700">Nombre para facturación *</label>
              <input
                id="fiscalNombre"
                name="fiscalNombre"
                type="text"
                required
                defaultValue={tipoFiscal === "cf" ? "Consumidor Final" : ""}
                className="w-full rounded-md border border-neutral-300 p-2"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Por regulaciones de la SAT, las compras de Q2.500 o más requieren NIT o CUI.
          </p>
        </div>
      </section>

      <button
        type="submit"
        disabled={enCurso}
        className="w-full rounded-lg bg-[#E11133] px-6 py-4 text-lg font-bold text-white shadow-md transition-colors hover:bg-[#B80D28] disabled:opacity-50"
      >
        {enCurso ? "Procesando pedido…" : "Confirmar y solicitar pedido"}
      </button>
    </form>
  );
}
```

```tsx
// app/checkout/page.tsx
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import geografia from "@/db/datos/geografia-gt.json";
import { listarDirecciones } from "../identidad/direcciones.server";
import { leerClienteActual } from "../identidad/sesion.server";
import { obtenerCheckoutActivo } from "../lib/ajustes.server";
import { aDireccionGuardadaDto } from "../pedidos/contratos";
import { FormularioCheckout } from "./FormularioCheckout";

export const metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar?redirigir=/checkout");
  }

  const checkoutActivo = await obtenerCheckoutActivo();
  if (!checkoutActivo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-neutral-900">Compra en línea en mantenimiento</h1>
        <p className="mb-8 text-neutral-600">
          Estamos terminando de preparar el cierre de compra. Tu carrito sigue guardado tal y como lo dejaste.
        </p>
        <Link href="/carrito" className="inline-block rounded-md bg-[#001B59] px-6 py-3 font-medium text-white">
          Volver al carrito
        </Link>
      </div>
    );
  }

  // `listarDirecciones` devuelve filas crudas; el adaptador es el único punto que
  // toca esas claves, y la interfaz recibe ya un DTO tipado.
  const direcciones = (await listarDirecciones(cliente.id)).map(aDireccionGuardadaDto);

  // Una clave por carga de la pantalla. El reintento de pago **no** genera otra:
  // reutiliza la referencia del pedido, así que un fallo de la pasarela no puede
  // acabar en dos pedidos.
  const idempotencyKey = randomUUID();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-extrabold text-neutral-900">Finalizar compra</h1>
      <FormularioCheckout
        idempotencyKey={idempotencyKey}
        direccionesGuardadas={direcciones}
        departamentos={geografia.departamentos}
        municipios={geografia.municipios}
      />
    </div>
  );
}
```

```tsx
// app/checkout/confirmacion/[referencia]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { aQuetzales } from "../../../lib/dinero";
import { formatPrice } from "../../../lib/formatters";
import { leerClienteActual } from "../../../identidad/sesion.server";
import { leerPedidoPorReferencia } from "../../../pedidos/pedidos.server";
import { esReferenciaValida } from "../../../pedidos/referencia";

export const metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ referencia: string }> };

export default async function ConfirmacionPedidoPage({ params }: Props) {
  const { referencia } = await params;

  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar?redirigir=/checkout");
  }

  // Una referencia mal formada no llega siquiera a consultarse.
  if (!esReferenciaValida(referencia)) {
    notFound();
  }

  // Un pedido ajeno y uno inexistente devuelven exactamente lo mismo: 404.
  const pedido = await leerPedidoPorReferencia(referencia, cliente.id);
  if (!pedido) {
    notFound();
  }

  const esGuatex = pedido.shippingMethod === "guatex";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="mb-2 text-3xl font-extrabold text-neutral-900">
        {esGuatex ? "¡Solicitud recibida!" : "¡Pedido confirmado!"}
      </h1>
      <p className="mb-8 text-neutral-600">
        {esGuatex ? (
          <>
            Hemos recibido tu pedido <strong>#{pedido.reference}</strong>. Nos pondremos en contacto contigo
            por WhatsApp para finalizar la compra.
          </>
        ) : (
          <>
            Hemos registrado tu pedido <strong>#{pedido.reference}</strong> para entrega con mensajero propio.
          </>
        )}
      </p>

      <div className="mb-8 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-left">
        <div className="flex justify-between border-b border-neutral-200 pb-2">
          <span className="font-medium text-neutral-600">Número de referencia</span>
          <span className="font-mono font-bold text-neutral-900">#{pedido.reference}</span>
        </div>
        <div className="flex justify-between border-b border-neutral-200 pb-2">
          <span className="text-neutral-600">Destinatario</span>
          <span className="font-semibold text-neutral-800">{pedido.direccion.destinatario}</span>
        </div>
        <div className="flex justify-between border-b border-neutral-200 pb-2">
          <span className="text-neutral-600">Dirección</span>
          <span className="text-neutral-800">
            {pedido.direccion.linea1}
            {pedido.direccion.zonaCapitalina !== null ? `, zona ${pedido.direccion.zonaCapitalina}` : ""}
          </span>
        </div>
        <div className="flex justify-between border-b border-neutral-200 pb-2">
          <span className="text-neutral-600">Método de envío</span>
          <span className="font-semibold text-neutral-800">
            {esGuatex ? "Guatex (flete por confirmar)" : "Mensajero propio"}
          </span>
        </div>
        <div className="flex justify-between border-b border-neutral-200 pb-2">
          <span className="text-neutral-600">Subtotal de productos</span>
          <span className="font-medium text-neutral-900">{formatPrice(aQuetzales(pedido.subtotalCents))}</span>
        </div>
        {!esGuatex && (
          <div className="flex justify-between border-b border-neutral-200 pb-2">
            <span className="text-neutral-600">Envío</span>
            <span className="font-medium text-neutral-900">
              {pedido.shippingCostCents === 0 ? "Gratuito" : formatPrice(aQuetzales(pedido.shippingCostCents ?? 0))}
            </span>
          </div>
        )}
        <div className="flex justify-between pt-1">
          <span className="font-bold text-neutral-800">Total facturado</span>
          <span className="text-lg font-bold text-neutral-900">
            {pedido.totalCents !== null ? formatPrice(aQuetzales(pedido.totalCents)) : "Pendiente del flete"}
          </span>
        </div>
      </div>

      <Link href="/" className="rounded-md bg-[#001B59] px-6 py-3 font-medium text-white">
        Volver al inicio
      </Link>
    </div>
  );
}
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/checkout-validacion.test.ts tests/checkout-orquestador.test.ts`

- [ ] **Paso 6: Registrar en `package.json` y verificar linters**
  - Añadir `tests/checkout-validacion.test.ts` y `tests/checkout-orquestador.test.ts` a `test:datos`.
  - Ejecutar: `npm run test:datos && npm run typecheck && npm run lint && npm run build`.

- [ ] **Paso 7: Commit de la tarea 11**
  - Mensaje: `feat(checkout): validacion previa, orquestacion pura y pago posterior al commit`

---

### Tarea 12: Enlace de WhatsApp puro y permisos administrativos de pedidos

**Files:**
- Crear: `app/admin/pedidos/enlaceWhatsapp.ts`
- Modificar: `app/admin/auth/permisos.ts`
- Modificar: `app/admin/auth/authorization.server.ts`
- Crear: `tests/admin-enlace-whatsapp.test.ts`
- Crear: `tests/admin-pedidos-permisos.test.ts`

**Interfaces:**
- En `app/admin/pedidos/enlaceWhatsapp.ts`:
  ```ts
  export function normalizarTelefonoGt(telefono: string): string;
  export function construirEnlaceWhatsapp(telefono: string, referencia: string): string;
  ```
- En `app/admin/auth/permisos.ts`:
  ```ts
  export const puedeEscribirEnvios: (rol: RolAdmin) => boolean;   // ya existe
  export const puedeLeerPedidos: (rol: RolAdmin) => boolean;      // administrador y empleado
  export const puedeEscribirPedidos: (rol: RolAdmin) => boolean;  // solo administrador
  ```
- En `app/admin/auth/authorization.server.ts`, `verificarPermisoParaAccion` acepta
  `"envios:escribir" | "pedidos:leer" | "pedidos:escribir"`.

- [ ] **Paso 1: Escribir las pruebas unitarias (RED)**

```ts
// tests/admin-enlace-whatsapp.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { construirEnlaceWhatsapp, normalizarTelefonoGt } from "../app/admin/pedidos/enlaceWhatsapp";

test("normaliza teléfonos guatemaltecos a 8 dígitos con prefijo 502", () => {
  assert.equal(normalizarTelefonoGt("1234-5678"), "50212345678");
  assert.equal(normalizarTelefonoGt("+502 1234 5678"), "50212345678");
  assert.equal(normalizarTelefonoGt("50212345678"), "50212345678");
});

test("rechaza teléfonos que no son guatemaltecos", () => {
  assert.throws(() => normalizarTelefonoGt("1234"), /Teléfono guatemalteco no válido/);
  assert.throws(() => normalizarTelefonoGt("+34 600 123 456"), /Teléfono guatemalteco no válido/);
});

test("construye un enlace seguro con saludo y referencia, sin datos sensibles", () => {
  const url = construirEnlaceWhatsapp("+502 1234-5678", "EC-2K7M9P4XBW");
  assert.ok(url.startsWith("https://wa.me/50212345678?text="));
  assert.ok(url.includes("EC-2K7M9P4XBW"));
  assert.equal(url.includes("NIT"), false);
  assert.equal(url.includes("CUI"), false);
  assert.equal(/direcci/i.test(url), false);
});

test("rechaza referencias que no cumplen el formato público", () => {
  assert.throws(() => construirEnlaceWhatsapp("12345678", "EC-0123456789"), /Referencia de pedido no válida/);
  assert.throws(() => construirEnlaceWhatsapp("12345678", "PED-2K7M9P4XBW"), /Referencia de pedido no válida/);
});
```

```ts
// tests/admin-pedidos-permisos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { puedeEscribirEnvios, puedeEscribirPedidos, puedeLeerPedidos } from "../app/admin/auth/permisos";

test("administrador y empleado pueden leer pedidos", () => {
  assert.equal(puedeLeerPedidos("administrador"), true);
  assert.equal(puedeLeerPedidos("empleado"), true);
});

test("solo el administrador puede escribir pedidos", () => {
  assert.equal(puedeEscribirPedidos("administrador"), true);
  assert.equal(puedeEscribirPedidos("empleado"), false);
});

test("el permiso de envíos no cambia con este subproyecto", () => {
  assert.equal(puedeEscribirEnvios("administrador"), true);
  assert.equal(puedeEscribirEnvios("empleado"), false);
});
```

- [ ] **Paso 2: Ejecutar las pruebas y comprobar que fallan (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-enlace-whatsapp.test.ts tests/admin-pedidos-permisos.test.ts`

- [ ] **Paso 3: Escribir la implementación (GREEN)**

```ts
// app/admin/pedidos/enlaceWhatsapp.ts
import { esReferenciaValida } from "@/app/pedidos/referencia";

/**
 * Enlace de WhatsApp para el administrador, no para el cliente.
 *
 * El texto lleva **solo** el saludo y la referencia pública. Ni NIT, ni CUI, ni
 * dirección, ni teléfono: una URL viaja por el historial del navegador, por los
 * registros de WhatsApp y por cualquier captura de pantalla.
 */
export function normalizarTelefonoGt(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 8) return `502${digitos}`;
  if (digitos.length === 11 && digitos.startsWith("502")) return digitos;
  throw new Error("Teléfono guatemalteco no válido: se esperan 8 dígitos, con o sin el prefijo 502.");
}

export function construirEnlaceWhatsapp(telefono: string, referencia: string): string {
  if (!esReferenciaValida(referencia)) {
    throw new Error("Referencia de pedido no válida.");
  }
  const numero = normalizarTelefonoGt(telefono);
  const texto = encodeURIComponent(
    `Hola, le escribimos de ECONOLUZ por su pedido #${referencia}.`,
  );
  return `https://wa.me/${numero}?text=${texto}`;
}
```

```ts
// app/admin/auth/permisos.ts
import type { RolAdmin } from "./types";

/** En 9A el empleado solo consulta. Los permisos operativos llegan en 9B. */
export const puedeEscribirEnvios = (rol: RolAdmin): boolean => rol === "administrador";

/**
 * El empleado **sí** consulta pedidos: atender el WhatsApp de una solicitud de
 * Guatex es su trabajo, y para eso necesita ver la ficha.
 */
export const puedeLeerPedidos = (rol: RolAdmin): boolean =>
  rol === "administrador" || rol === "empleado";

/**
 * Cambiar el estado de un pedido o rectificar su identificación fiscal tiene
 * consecuencias contables, así que se reserva al administrador.
 */
export const puedeEscribirPedidos = (rol: RolAdmin): boolean => rol === "administrador";
```

```ts
// app/admin/auth/authorization.server.ts  (fragmento modificado)
import { puedeEscribirEnvios, puedeEscribirPedidos, puedeLeerPedidos } from "./permisos";

export type PermisoAdmin = "envios:escribir" | "pedidos:leer" | "pedidos:escribir";

const COMPROBACIONES: Record<PermisoAdmin, (rol: RolAdmin) => boolean> = {
  "envios:escribir": puedeEscribirEnvios,
  "pedidos:leer": puedeLeerPedidos,
  "pedidos:escribir": puedeEscribirPedidos,
};

/**
 * El rol se relee de `admin_users` en cada acción: nunca se toma de la cookie ni
 * del formulario, y así un cambio de rol surte efecto sobre sesiones abiertas.
 */
export async function verificarPermisoParaAccion(
  permiso: PermisoAdmin,
): Promise<SessionUser & { rol: RolAdmin }> {
  const usuario = await verificarSesionParaAccion();
  const rol = await leerRolDeLaBase(usuario.id);
  if (!COMPROBACIONES[permiso](rol)) {
    redirect("/admin?error=sin-permiso");
  }
  return { ...usuario, rol };
}
```

- [ ] **Paso 4: Ejecutar las pruebas y comprobar que pasan (GREEN)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-enlace-whatsapp.test.ts tests/admin-pedidos-permisos.test.ts`

- [ ] **Paso 5: Registrar en `package.json` y verificar linters**
  - Añadir las dos pruebas a `test:admin`.
  - Ejecutar `npm run typecheck` y `npm run lint`.

- [ ] **Paso 6: Commit de la tarea 12**
  - Mensaje: `feat(admin): permisos de lectura y escritura de pedidos y enlace seguro de WhatsApp`

---

### Tarea 13: Panel administrativo de pedidos, Server Actions y suite E2E

**Files:**
- Crear: `app/admin/pedidos/logicaTransicion.ts`
- Crear: `app/admin/pedidos/actions.ts`
- Crear: `app/admin/(panel)/pedidos/page.tsx`
- Crear: `app/admin/(panel)/pedidos/[id]/page.tsx`
- Modificar: `app/admin/(panel)/page.tsx`
- Modificar: `tests/helpers/cliente-e2e.ts` (creado por el Plan A)
- Crear: `tests/admin-pedidos.test.ts`
- Crear: `tests/checkout-pedidos.spec.ts`
- Modificar: `playwright.config.ts`

**Interfaces:**
- En `app/admin/pedidos/logicaTransicion.ts` (módulo puro, sin `server-only`):
  ```ts
  export type EjecutorAdmin = (sql: string, params?: readonly unknown[]) => Promise<readonly unknown[]>;
  export function ejecutarTransicionEstadoPura(params: {
    pedidoId: string;
    siguienteEstado: EstadoPedido;
    adminId: string;
    ejecutar: EjecutorAdmin;
  }): Promise<{ ok: true }>;
  export function ejecutarVerificacionFiscalPura(params: {
    pedidoId: string;
    nuevoTipo: TipoIdentificacionFiscal;
    nuevoNumero: string | null;
    nuevoNombre: string;
    adminId: string;
    ejecutar: EjecutorAdmin;
  }): Promise<{ ok: true }>;
  ```
  Las pruebas de `node:test` importan **este** módulo, nunca `actions.ts`: una Server
  Action arrastra `"use server"`, `next/navigation` y la sesión, y probarla fuera del
  servidor solo demostraría que los dobles funcionan.

- [ ] **Paso 1: Escribir la prueba unitaria de la lógica administrativa (RED)**

```ts
// tests/admin-pedidos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ejecutarTransicionEstadoPura,
  ejecutarVerificacionFiscalPura,
  type EjecutorAdmin,
} from "../app/admin/pedidos/logicaTransicion";

function ejecutorConPedido(pedido: Record<string, unknown>, sentencias: string[]): EjecutorAdmin {
  return async (sql) => {
    sentencias.push(sql.trim());
    if (/select .* from orders where id = \$1 for update/i.test(sql)) return [pedido];
    return [];
  };
}

test("una transición legítima actualiza el estado y deja auditoría", async () => {
  const sentencias: string[] = [];
  const resultado = await ejecutarTransicionEstadoPura({
    pedidoId: "order-123",
    siguienteEstado: "contactado",
    adminId: "admin-1",
    ejecutar: ejecutorConPedido(
      { id: "order-123", shipping_method: "guatex", status: "pendiente_de_contacto", fiscal_verificado: false },
      sentencias,
    ),
  });

  assert.equal(resultado.ok, true);
  assert.equal(sentencias.some((s) => /update orders\s+set status/i.test(s)), true);
  assert.equal(sentencias.some((s) => /insert into audit_log/i.test(s)), true);
});

test("una transición ilegítima no toca la base de datos", async () => {
  const sentencias: string[] = [];

  await assert.rejects(
    async () => {
      await ejecutarTransicionEstadoPura({
        pedidoId: "order-123",
        siguienteEstado: "cerrado", // no se puede desde pendiente_de_contacto
        adminId: "admin-1",
        ejecutar: ejecutorConPedido(
          { id: "order-123", shipping_method: "guatex", status: "pendiente_de_contacto", fiscal_verificado: false },
          sentencias,
        ),
      });
    },
    /transicion-no-permitida/,
  );

  assert.equal(sentencias.some((s) => /update orders/i.test(s)), false);
  assert.equal(sentencias.some((s) => /insert into audit_log/i.test(s)), false);
});

test("no se cierra una solicitud de Guatex con la fiscalidad sin verificar", async () => {
  const sentencias: string[] = [];
  await assert.rejects(
    async () => {
      await ejecutarTransicionEstadoPura({
        pedidoId: "order-123",
        siguienteEstado: "cerrado",
        adminId: "admin-1",
        ejecutar: ejecutorConPedido(
          { id: "order-123", shipping_method: "guatex", status: "contactado", fiscal_verificado: false },
          sentencias,
        ),
      });
    },
    /transicion-no-permitida/,
  );
  assert.equal(sentencias.some((s) => /update orders/i.test(s)), false);
});

test("un pedido inexistente se rechaza sin escribir", async () => {
  const sentencias: string[] = [];
  await assert.rejects(
    async () => {
      await ejecutarTransicionEstadoPura({
        pedidoId: "order-inexistente",
        siguienteEstado: "contactado",
        adminId: "admin-1",
        ejecutar: async (sql) => {
          sentencias.push(sql.trim());
          return [];
        },
      });
    },
    /pedido-no-encontrado/,
  );
  assert.equal(sentencias.some((s) => /update orders/i.test(s)), false);
});

test("la verificación fiscal administrativa valida antes de marcar verificado", async () => {
  const sentencias: string[] = [];
  const resultado = await ejecutarVerificacionFiscalPura({
    pedidoId: "order-123",
    nuevoTipo: "nit",
    nuevoNumero: " 1234567-k ",
    nuevoNombre: "  Empresa S.A.  ",
    adminId: "admin-1",
    ejecutar: ejecutorConPedido(
      {
        id: "order-123",
        shipping_method: "guatex",
        subtotal_cents: 150000,
        total_cents: null,
        fiscal_tipo: "cf",
        fiscal_verificado: false,
      },
      sentencias,
    ),
  });

  assert.equal(resultado.ok, true);
  assert.equal(sentencias.some((s) => /update orders[\s\S]*fiscal_verificado = true/i.test(s)), true);
  assert.equal(sentencias.some((s) => /insert into audit_log/i.test(s)), true);
});

test("la verificación fiscal rechaza CF cuando el importe alcanza el umbral legal", async () => {
  const sentencias: string[] = [];
  await assert.rejects(
    async () => {
      await ejecutarVerificacionFiscalPura({
        pedidoId: "order-123",
        nuevoTipo: "cf",
        nuevoNumero: null,
        nuevoNombre: "Consumidor Final",
        adminId: "admin-1",
        ejecutar: ejecutorConPedido(
          {
            id: "order-123",
            shipping_method: "guatex",
            subtotal_cents: 260000,
            total_cents: null,
            fiscal_tipo: "cf",
            fiscal_verificado: false,
          },
          sentencias,
        ),
      });
    },
    /regulaciones de la SAT/i,
  );
  assert.equal(sentencias.some((s) => /update orders/i.test(s)), false);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla (RED)**
  - Comando: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-pedidos.test.ts`

- [ ] **Paso 3: Escribir la lógica pura, las Server Actions y las pantallas (GREEN)**

```ts
// app/admin/pedidos/logicaTransicion.ts
import { puedeTransicionarPedido } from "@/app/pedidos/estados";
import { validarDatosFiscales } from "@/app/pedidos/fiscal";
import type { EstadoPedido, MetodoEnvio, TipoIdentificacionFiscal } from "@/app/pedidos/contratos";

/**
 * Las dos decisiones administrativas, en un módulo puro y con el ejecutor inyectado.
 *
 * Vive fuera de `actions.ts` a propósito: así `node:test` la ejercita entera sin
 * arrastrar `"use server"`, `next/navigation` ni la sesión del panel.
 */
export type EjecutorAdmin = (sql: string, params?: readonly unknown[]) => Promise<readonly unknown[]>;

export async function ejecutarTransicionEstadoPura(params: {
  pedidoId: string;
  siguienteEstado: EstadoPedido;
  adminId: string;
  ejecutar: EjecutorAdmin;
}): Promise<{ ok: true }> {
  const { pedidoId, siguienteEstado, adminId, ejecutar } = params;

  const filas = (await ejecutar(
    "SELECT id, shipping_method, status, fiscal_verificado FROM orders WHERE id = $1 FOR UPDATE",
    [pedidoId],
  )) as Array<{
    id: string;
    shipping_method: MetodoEnvio;
    status: EstadoPedido;
    fiscal_verificado: boolean;
  }>;

  const pedido = filas[0];
  if (!pedido) {
    throw new Error("pedido-no-encontrado");
  }

  const permitida = puedeTransicionarPedido({
    metodo: pedido.shipping_method,
    actual: pedido.status,
    siguiente: siguienteEstado,
    fiscalVerificado: pedido.fiscal_verificado,
  });

  if (!permitida) {
    throw new Error("transicion-no-permitida");
  }

  await ejecutar("UPDATE orders SET status = $1 WHERE id = $2", [siguienteEstado, pedidoId]);

  await ejecutar(
    `INSERT INTO audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
     VALUES ('admin', $1, 'transicionar_estado_pedido', 'orders', $2, $3::jsonb, $4::jsonb)`,
    [
      adminId,
      pedidoId,
      JSON.stringify({ status: pedido.status }),
      JSON.stringify({ status: siguienteEstado }),
    ],
  );

  return { ok: true };
}

export async function ejecutarVerificacionFiscalPura(params: {
  pedidoId: string;
  nuevoTipo: TipoIdentificacionFiscal;
  nuevoNumero: string | null;
  nuevoNombre: string;
  adminId: string;
  ejecutar: EjecutorAdmin;
}): Promise<{ ok: true }> {
  const { pedidoId, nuevoTipo, nuevoNumero, nuevoNombre, adminId, ejecutar } = params;

  const filas = (await ejecutar(
    `SELECT id, shipping_method, subtotal_cents, total_cents, fiscal_tipo, fiscal_verificado
       FROM orders WHERE id = $1 FOR UPDATE`,
    [pedidoId],
  )) as Array<{
    id: string;
    shipping_method: MetodoEnvio;
    subtotal_cents: number;
    total_cents: number | null;
    fiscal_tipo: string;
    fiscal_verificado: boolean;
  }>;

  const pedido = filas[0];
  if (!pedido) {
    throw new Error("pedido-no-encontrado");
  }

  // Se evalúa contra el importe conocido: el total cuando lo hay, y el subtotal de
  // productos cuando el flete de Guatex sigue sin cerrarse.
  const importe = pedido.total_cents ?? pedido.subtotal_cents;
  const validacion = validarDatosFiscales({
    totalOsubtotalCents: importe,
    datos: { tipo: nuevoTipo, numero: nuevoNumero, nombre: nuevoNombre },
    esGuatex: pedido.shipping_method === "guatex",
  });

  if (!validacion.ok) {
    throw new Error(validacion.error);
  }

  await ejecutar(
    `UPDATE orders
        SET fiscal_tipo = $1, fiscal_numero = $2, fiscal_nombre = $3, fiscal_verificado = true
      WHERE id = $4`,
    [validacion.tipo, validacion.numero, validacion.nombre, pedidoId],
  );

  await ejecutar(
    `INSERT INTO audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
     VALUES ('admin', $1, 'verificar_fiscal_pedido', 'orders', $2, $3::jsonb, $4::jsonb)`,
    [
      adminId,
      pedidoId,
      JSON.stringify({ fiscalTipo: pedido.fiscal_tipo, fiscalVerificado: pedido.fiscal_verificado }),
      JSON.stringify({ fiscalTipo: validacion.tipo, fiscalVerificado: true }),
    ],
  );

  return { ok: true };
}
```

```ts
// app/admin/pedidos/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { escribir } from "@/app/lib/datos";
import { ESTADOS_PEDIDO_VALIDOS, type EstadoPedido, type TipoIdentificacionFiscal } from "@/app/pedidos/contratos";
import { verificarPermisoParaAccion } from "../auth/authorization.server";
import { ejecutarTransicionEstadoPura, ejecutarVerificacionFiscalPura } from "./logicaTransicion";

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIPOS_FISCALES: readonly TipoIdentificacionFiscal[] = ["cf", "nit", "cui"];

export async function transicionarEstadoPedidoAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("pedidos:escribir");

  // `orders.id` es `uuid`: se valida antes de que llegue a ninguna consulta.
  const pedidoId = String(formData.get("pedidoId") ?? "").trim();
  if (!REGEX_UUID.test(pedidoId)) {
    redirect("/admin/pedidos?error=pedido-no-valido");
  }

  const siguienteCrudo = String(formData.get("siguienteEstado") ?? "").trim();
  if (!(ESTADOS_PEDIDO_VALIDOS as readonly string[]).includes(siguienteCrudo)) {
    redirect(`/admin/pedidos/${pedidoId}?error=estado-no-valido`);
  }

  await escribir(
    async (ejecutar) => {
      await ejecutarTransicionEstadoPura({
        pedidoId,
        siguienteEstado: siguienteCrudo as EstadoPedido,
        adminId: admin.id,
        ejecutar,
      });
    },
    { suceso: "admin-transicionar-estado-pedido" },
  );

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  redirect(`/admin/pedidos/${pedidoId}?exito=estado-actualizado`);
}

export async function verificarFiscalPedidoAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("pedidos:escribir");

  const pedidoId = String(formData.get("pedidoId") ?? "").trim();
  if (!REGEX_UUID.test(pedidoId)) {
    redirect("/admin/pedidos?error=pedido-no-valido");
  }

  const tipoCrudo = String(formData.get("nuevoTipo") ?? "").trim();
  if (!(TIPOS_FISCALES as readonly string[]).includes(tipoCrudo)) {
    redirect(`/admin/pedidos/${pedidoId}?error=tipo-fiscal-no-valido`);
  }

  const numeroCrudo = String(formData.get("nuevoNumero") ?? "").trim();
  const nombre = String(formData.get("nuevoNombre") ?? "").trim();

  await escribir(
    async (ejecutar) => {
      await ejecutarVerificacionFiscalPura({
        pedidoId,
        nuevoTipo: tipoCrudo as TipoIdentificacionFiscal,
        nuevoNumero: numeroCrudo || null,
        nuevoNombre: nombre,
        adminId: admin.id,
        ejecutar,
      });
    },
    { suceso: "admin-verificar-fiscal-pedido" },
  );

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  redirect(`/admin/pedidos/${pedidoId}?exito=fiscal-verificado`);
}
```

```tsx
// app/admin/(panel)/pedidos/page.tsx
import Link from "next/link";
import { verificarPermisoParaAccion } from "@/app/admin/auth/authorization.server";
import { leer } from "@/app/lib/datos";
import { aQuetzales } from "@/app/lib/dinero";
import { formatPrice } from "@/app/lib/formatters";

type FilaListado = {
  id: string;
  reference: string;
  user_email: string;
  status: string;
  shipping_method: string;
  subtotal_cents: number;
  total_cents: number | null;
  fiscal_tipo: string;
  fiscal_verificado: boolean;
};

export default async function AdminPedidosPage() {
  await verificarPermisoParaAccion("pedidos:leer");

  const pedidos = await leer<FilaListado>(
    `select o.id, o.reference, u.email as user_email, o.status, o.shipping_method,
            o.subtotal_cents, o.total_cents, o.fiscal_tipo, o.fiscal_verificado
       from orders o
       join users u on u.id = o.user_id
      order by o.created_at desc
      limit 100`,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Pedidos y solicitudes de entrega</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-neutral-600">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fiscal</th>
              <th className="px-4 py-3">Importe</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {pedidos.map((pedido) => (
              <tr key={pedido.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono font-semibold text-neutral-900">#{pedido.reference}</td>
                <td className="px-4 py-3">{pedido.user_email}</td>
                <td className="px-4 py-3">{pedido.shipping_method === "guatex" ? "Guatex" : "Mensajero propio"}</td>
                <td className="px-4 py-3"><span className="rounded bg-neutral-100 px-2 py-1 text-xs">{pedido.status}</span></td>
                <td className="px-4 py-3">
                  <span className="rounded px-2 py-0.5 text-xs">
                    {pedido.fiscal_tipo.toUpperCase()} {pedido.fiscal_verificado ? "verificado" : "pendiente"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {pedido.total_cents !== null
                    ? formatPrice(aQuetzales(pedido.total_cents))
                    : `${formatPrice(aQuetzales(pedido.subtotal_cents))} + flete`}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/pedidos/${pedido.id}`} className="text-xs font-semibold text-[#001B59] hover:underline">
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

```tsx
// app/admin/(panel)/pedidos/[id]/page.tsx
import { notFound } from "next/navigation";
import { verificarPermisoParaAccion } from "@/app/admin/auth/authorization.server";
import { construirEnlaceWhatsapp } from "@/app/admin/pedidos/enlaceWhatsapp";
import {
  transicionarEstadoPedidoAction,
  verificarFiscalPedidoAction,
} from "@/app/admin/pedidos/actions";
import { leer } from "@/app/lib/datos";
import { aQuetzales } from "@/app/lib/dinero";
import { formatPrice } from "@/app/lib/formatters";

type FilaDetalle = {
  id: string;
  reference: string;
  user_email: string;
  status: string;
  shipping_method: string;
  shipping_cost_cents: number | null;
  subtotal_cents: number;
  total_cents: number | null;
  fiscal_tipo: string;
  fiscal_numero: string | null;
  fiscal_nombre: string;
  fiscal_verificado: boolean;
  destinatario: string;
  telefono: string;
  departamento_codigo: string;
  municipio_codigo: string;
  zona_capitalina: number | null;
  linea1: string;
  referencias: string | null;
};

type FilaItem = {
  quantity: number;
  unit_price_cents: number;
  snapshot_reference: string;
  snapshot_title: string;
};

type Props = { params: Promise<{ id: string }> };

export default async function AdminPedidoFichaPage({ params }: Props) {
  const { id } = await params;
  const { rol } = await verificarPermisoParaAccion("pedidos:leer");

  // `order_addresses` se une con JOIN, no con LEFT JOIN: la instantánea de dirección
  // se escribe en la misma transacción que el pedido, así que un pedido sin ella es
  // una incoherencia y debe verse como tal, no pintarse a medias.
  const pedidos = await leer<FilaDetalle>(
    `select o.id, o.reference, u.email as user_email, o.status, o.shipping_method,
            o.shipping_cost_cents, o.subtotal_cents, o.total_cents,
            o.fiscal_tipo, o.fiscal_numero, o.fiscal_nombre, o.fiscal_verificado,
            oa.recipient_name as destinatario, oa.phone as telefono,
            oa.departamento_codigo, oa.municipio_codigo, oa.zona_capitalina,
            oa.line1 as linea1, oa.references_note as referencias
       from orders o
       join users u on u.id = o.user_id
       join order_addresses oa on oa.order_id = o.id
      where o.id = $1`,
    [id],
  );

  const pedido = pedidos[0];
  if (!pedido) notFound();

  const items = await leer<FilaItem>(
    `select quantity, unit_price_cents, snapshot_reference, snapshot_title
       from order_items where order_id = $1 order by created_at, id`,
    [id],
  );

  const enlaceWhatsapp = construirEnlaceWhatsapp(pedido.telefono, pedido.reference);
  const puedeEscribir = rol === "administrador";

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase text-neutral-500">Ficha de pedido</span>
          <h1 className="text-2xl font-extrabold text-neutral-900">#{pedido.reference}</h1>
        </div>
        <a
          href={enlaceWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-[#001B59] px-4 py-2 text-sm font-semibold text-white"
        >
          Contactar por WhatsApp
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-800">Datos de entrega</h2>
          <p className="text-sm"><strong>Cliente:</strong> {pedido.user_email}</p>
          <p className="text-sm"><strong>Destinatario:</strong> {pedido.destinatario}</p>
          <p className="text-sm"><strong>Teléfono:</strong> {pedido.telefono}</p>
          <p className="text-sm"><strong>Dirección:</strong> {pedido.linea1}</p>
          <p className="text-sm">
            <strong>Destino:</strong> departamento {pedido.departamento_codigo}, municipio {pedido.municipio_codigo}
            {pedido.zona_capitalina !== null ? `, zona ${pedido.zona_capitalina}` : ""}
          </p>
          {pedido.referencias && <p className="text-sm"><strong>Referencias:</strong> {pedido.referencias}</p>}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-800">Datos fiscales</h2>
          <p className="text-sm"><strong>Tipo:</strong> {pedido.fiscal_tipo.toUpperCase()}</p>
          <p className="text-sm"><strong>Número:</strong> {pedido.fiscal_numero ?? "sin número (Consumidor Final)"}</p>
          <p className="text-sm"><strong>Nombre:</strong> {pedido.fiscal_nombre}</p>
          <p className="text-sm">
            <strong>Estado fiscal:</strong> {pedido.fiscal_verificado ? "verificado" : "requiere verificación"}
          </p>

          {!pedido.fiscal_verificado && puedeEscribir && (
            <form action={verificarFiscalPedidoAction} className="mt-4 space-y-2 border-t border-neutral-200 pt-3">
              <input type="hidden" name="pedidoId" value={pedido.id} />
              <p className="text-xs font-medium text-neutral-500">Confirmar o rectificar los datos fiscales:</p>
              <div className="flex gap-2">
                <select name="nuevoTipo" defaultValue={pedido.fiscal_tipo} className="rounded border border-neutral-300 p-1 text-xs">
                  <option value="cf">CF</option>
                  <option value="nit">NIT</option>
                  <option value="cui">CUI</option>
                </select>
                <input
                  type="text"
                  name="nuevoNumero"
                  defaultValue={pedido.fiscal_numero ?? ""}
                  placeholder="Número"
                  className="flex-1 rounded border border-neutral-300 p-1 text-xs"
                />
              </div>
              <input
                type="text"
                name="nuevoNombre"
                defaultValue={pedido.fiscal_nombre}
                placeholder="Nombre fiscal"
                className="w-full rounded border border-neutral-300 p-1 text-xs"
              />
              <button type="submit" className="rounded bg-neutral-800 px-3 py-1 text-xs text-white">
                Validar y marcar verificado
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-neutral-800">Líneas del pedido</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
              <th className="py-2">Referencia</th>
              <th className="py-2">Producto</th>
              <th className="py-2 text-right">Cantidad</th>
              <th className="py-2 text-right">Precio</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {items.map((item) => (
              <tr key={`${item.snapshot_reference}-${item.unit_price_cents}`}>
                <td className="py-2 font-mono text-xs">{item.snapshot_reference}</td>
                <td className="py-2">{item.snapshot_title}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{formatPrice(aQuetzales(item.unit_price_cents))}</td>
                <td className="py-2 text-right font-medium">
                  {formatPrice(aQuetzales(item.unit_price_cents * item.quantity))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-right text-sm">
          <div>Subtotal: <strong>{formatPrice(aQuetzales(pedido.subtotal_cents))}</strong></div>
          {pedido.shipping_cost_cents !== null && (
            <div>
              Envío: <strong>{pedido.shipping_cost_cents === 0 ? "Gratuito" : formatPrice(aQuetzales(pedido.shipping_cost_cents))}</strong>
            </div>
          )}
          <div className="text-base">
            Total: <strong>{pedido.total_cents !== null ? formatPrice(aQuetzales(pedido.total_cents)) : "pendiente del flete"}</strong>
          </div>
        </div>
      </section>

      {puedeEscribir && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-neutral-800">Gestión de estado</h2>
          <form action={transicionarEstadoPedidoAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="pedidoId" value={pedido.id} />
            {pedido.status === "pendiente_de_contacto" && (
              <button name="siguienteEstado" value="contactado" className="rounded bg-[#001B59] px-4 py-2 text-xs font-semibold text-white">
                Marcar como contactado
              </button>
            )}
            {pedido.status === "contactado" && pedido.fiscal_verificado && (
              <button name="siguienteEstado" value="cerrado" className="rounded bg-[#001B59] px-4 py-2 text-xs font-semibold text-white">
                Cerrar pedido
              </button>
            )}
            {(pedido.status === "pendiente_de_contacto" ||
              pedido.status === "contactado" ||
              pedido.status === "pendiente_de_pago") && (
              <button name="siguienteEstado" value="cancelado" className="rounded border border-[#E11133] px-4 py-2 text-xs font-semibold text-[#E11133]">
                Cancelar pedido
              </button>
            )}
          </form>
          {pedido.shipping_method === "mensajero_propio" && (
            <p className="mt-3 text-xs text-neutral-500">
              Un pedido de mensajero propio permanece en «pendiente de pago» hasta que exista la pasarela.
              No se puede cerrar a mano como si estuviera cobrado.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
```

```tsx
// app/admin/(panel)/page.tsx
import Link from "next/link";
import { formatNumber } from "../../lib/formatters";
import { verificarSesion } from "../auth/authorization.server";
import { getCatalogStats } from "../panelStats.server";

// Depende de la cookie: no se puede prerenderizar.
export const dynamic = "force-dynamic";

const SECCIONES = [
  {
    titulo: "Productos",
    descripcion: "Buscar, poner precio y existencias, publicar y ocultar.",
    estado: "Disponible",
    href: "/admin/productos",
  },
  {
    titulo: "Galería de proyectos",
    descripcion: "Crear, ordenar y publicar obras y sus fotografías.",
    estado: "Disponible",
    href: "/admin/proyectos",
  },
  {
    titulo: "Envíos y tarifas",
    descripcion: "Zonas de reparto, tarifas oficiales y cobertura nacional.",
    estado: "Disponible",
    href: "/admin/envios",
  },
  {
    titulo: "Pedidos y solicitudes",
    descripcion: "Pedidos de mensajero propio y solicitudes de entrega con Guatex.",
    estado: "Disponible",
    href: "/admin/pedidos",
  },
];

export default async function PanelPage() {
  const usuario = await verificarSesion();
  const stats = await getCatalogStats();

  const cifras = stats
    ? [
        { etiqueta: "Productos en el catálogo", valor: stats.total, nota: null },
        {
          etiqueta: "Publicados en la web",
          valor: stats.publicados,
          nota:
            stats.total > stats.publicados
              ? `${formatNumber(stats.total - stats.publicados)} sin publicar`
              : "todos visibles",
        },
        {
          etiqueta: "Con precio puesto",
          valor: stats.conPrecio,
          nota:
            stats.total > stats.conPrecio
              ? `faltan ${formatNumber(stats.total - stats.conPrecio)}`
              : "catálogo completo",
        },
      ]
    : [];

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <h1 className="text-3xl font-semibold sm:text-4xl">Hola, {usuario.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
            Desde aquí se administra el contenido de la web sin tocar código. El acceso ya
            está protegido; las pantallas de contenido llegan en los siguientes pasos.
          </p>

          {cifras.length > 0 ? (
            <dl className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
              {cifras.map((cifra) => (
                <div key={cifra.etiqueta} className="border-t-2 border-tienda-claro pt-4">
                  <dt className="text-sm text-white/70">{cifra.etiqueta}</dt>
                  <dd className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">
                    {formatNumber(cifra.valor)}
                  </dd>
                  {cifra.nota ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/55">
                      {cifra.nota}
                    </p>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-10 border-t-2 border-tienda-claro pt-4 text-sm text-white/70">
              No se pudo leer el catálogo ahora mismo. El panel funciona igual; vuelve a
              cargar en un momento.
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-tienda">
          Secciones
        </h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2">
          {SECCIONES.map((seccion) => (
            <li key={seccion.titulo}>
              {seccion.href ? (
                <Link
                  href={seccion.href}
                  className="block h-full border-t-2 border-tienda bg-neutral-50 p-6 transition duration-300 hover:bg-white hover:shadow-[0_18px_40px_rgba(0,27,89,0.12)]"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold text-proyectos">{seccion.titulo}</h3>
                    <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-tienda">
                      {seccion.estado}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{seccion.descripcion}</p>
                </Link>
              ) : (
                <div className="h-full border-t-2 border-proyectos/30 bg-neutral-50 p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold text-proyectos">{seccion.titulo}</h3>
                    <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-neutral-500">
                      {seccion.estado}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{seccion.descripcion}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
```

- [ ] **Paso 4: Actualizar el ayudante de clientes E2E creado por el Plan A**

`tests/helpers/cliente-e2e.ts` ya existe: lo crea la tarea 8 del Plan A. Para evitar definiciones duplicadas de funciones en el archivo, se debe **REEMPLAZAR íntegramente el cuerpo existente de la función `limpiarClienteE2E`** para incluir las tablas de pedidos respetando estrictamente el orden de dependencias de claves foráneas (`order_items` -> `order_addresses` -> `orders` -> `cart_items` -> `carts` -> `user_addresses` -> `auth_events` -> `user_consents` -> `users`).

```ts
// tests/helpers/cliente-e2e.ts — Reemplazo completo de la función limpiarClienteE2E
/**
 * Limpieza completa de un cliente de prueba, en orden estricto de claves foráneas.
 *
 * Se borran primero las tablas dependientes de pedidos antes de orders, y luego
 * las tablas de carritos, direcciones, eventos y el usuario.
 *
 * **Propaga los errores.** Una limpieza que se traga el fallo deja fixtures vivos
 * que rompen la siguiente ejecución en un sitio distinto y por un motivo que ya no
 * se puede relacionar con esta prueba.
 */
export async function limpiarClienteE2E(userId: string): Promise<void> {
  const sql = getE2ESql();
  await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})`;
  await sql`DELETE FROM order_addresses WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})`;
  await sql`DELETE FROM orders WHERE user_id = ${userId}`;
  await sql`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ${userId})`;
  await sql`DELETE FROM carts WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_addresses WHERE user_id = ${userId}`;
  await sql`DELETE FROM auth_events WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_consents WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
}
```

Verificar inmediatamente que no han quedado funciones duplicadas y que existe exactamente una única coincidencia de la función en el archivo mediante el comando:
```bash
node -e "const f = require('fs').readFileSync('tests/helpers/cliente-e2e.ts', 'utf8'); const c = (f.match(/export async function limpiarClienteE2E/g) || []).length; if (c !== 1) { console.error('Error: se encontraron ' + c + ' declaraciones de limpiarClienteE2E. Debe haber exactamente 1.'); process.exit(1); } else { console.log('Verificación superada: exactamente 1 declaración de limpiarClienteE2E.'); }"
```

- [ ] **Paso 5: Escribir la suite E2E completa**

```ts
// tests/checkout-pedidos.spec.ts
import { test, expect, type BrowserContext } from "@playwright/test";
import { autenticarComoAdmin, getE2ESql } from "./helpers/admin-e2e";
import {
  aprovisionarClienteE2E,
  autenticarComoCliente,
  exigirBaseE2EAislada,
  exigirEmuladorFirebase,
  exigirRamaE2E,
  limpiarClienteE2E,
  type ClienteE2E,
} from "./helpers/cliente-e2e";

/**
 * Referencias de fixture, todas con el formato público real
 * `^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$`. Una referencia con `0`, `1`, `I`
 * u `O` la rechazaría `chk_orders_reference_format` y la prueba fallaría por el
 * motivo equivocado.
 */
const REF_GUATEX = "EC-GTX9876543";
const REF_WHATSAPP = "EC-WA98765432";
const REF_TRANSICION = "EC-TR2345678W";
const REF_DE_OTRO_CLIENTE = "EC-AJENA23456";
const REF_INEXISTENTE = "EC-ZZZZZZZZZZ";

const sql = getE2ESql();

async function crearSolicitudGuatex(params: {
  userId: string;
  reference: string;
  subtotalCents?: number;
}): Promise<string> {
  const filas = await sql`
    INSERT INTO orders (
      user_id, reference, status, shipping_method, shipping_cost_cents,
      subtotal_cents, total_cents, fiscal_tipo, fiscal_numero, fiscal_nombre,
      fiscal_verificado, idempotency_key
    ) VALUES (
      ${params.userId}, ${params.reference}, 'pendiente_de_contacto', 'guatex', NULL,
      ${params.subtotalCents ?? 15000}, NULL, 'cf', NULL, 'Consumidor Final',
      false, ${`e2e-${params.reference}-${Date.now()}`}
    )
    RETURNING id
  `;
  const orderId = String(filas[0].id);

  // La ficha administrativa une `order_addresses` con JOIN, así que la instantánea
  // de dirección se crea siempre antes de abrirla.
  await sql`
    INSERT INTO order_addresses (
      order_id, recipient_name, phone, departamento_codigo, municipio_codigo,
      zona_capitalina, line1, references_note
    ) VALUES (
      ${orderId}, 'Carlos Ruiz', '55551122', '01', '0101',
      17, 'Colonia Las Flores 4-20', NULL
    )
  `;

  return orderId;
}

async function borrarPedido(orderId: string): Promise<void> {
  await sql`DELETE FROM order_items WHERE order_id = ${orderId}`;
  await sql`DELETE FROM order_addresses WHERE order_id = ${orderId}`;
  await sql`DELETE FROM orders WHERE id = ${orderId}`;
}

test.describe("Checkout, pedidos y gestión administrativa", () => {
  let clienteA: ClienteE2E;
  let clienteB: ClienteE2E;
  let valorOriginalCheckoutActivo: string;

  test.beforeAll(async ({ browser }) => {
    // Rechaza Producción, exige el emulador de Firebase e identifica positivamente
    // la rama E2E de Neon. Sin esto la suite se detiene en lugar de escribir a ciegas.
    exigirBaseE2EAislada();
    exigirEmuladorFirebase();
    await exigirRamaE2E();

    const filas = await sql`SELECT valor FROM app_settings WHERE clave = 'checkout_activo'`;
    if (filas.length === 0) {
      throw new Error("Falta la clave checkout_activo en app_settings: aplica la migración 016 en la rama E2E.");
    }
    valorOriginalCheckoutActivo = String(filas[0].valor);

    const contexto = await browser.newContext();
    try {
      clienteA = await aprovisionarClienteE2E(contexto, "a");
      clienteB = await aprovisionarClienteE2E(contexto, "b");
    } finally {
      await contexto.close();
    }
  });

  test.afterAll(async () => {
    // Se restaura el interruptor y se limpian los dos clientes. Cada paso se intenta
    // aunque falle el anterior, y el primer error se propaga al terminar.
    const fallos: unknown[] = [];

    for (const tarea of [
      async () => {
        await sql`UPDATE app_settings SET valor = ${valorOriginalCheckoutActivo} WHERE clave = 'checkout_activo'`;
      },
      async () => {
        if (clienteA?.userId) await limpiarClienteE2E(clienteA.userId);
      },
      async () => {
        if (clienteB?.userId) await limpiarClienteE2E(clienteB.userId);
      },
    ]) {
      try {
        await tarea();
      } catch (error) {
        fallos.push(error);
      }
    }

    // Comprobación final: no puede quedar ningún fixture.
    try {
      const residuos = await sql`
        SELECT count(*)::int AS total FROM orders
         WHERE reference IN (${REF_GUATEX}, ${REF_WHATSAPP}, ${REF_TRANSICION}, ${REF_DE_OTRO_CLIENTE})
      `;
      expect(residuos[0].total).toBe(0);
    } catch (error) {
      fallos.push(error);
    }

    if (fallos.length === 1) throw fallos[0];
    if (fallos.length > 1) throw new AggregateError(fallos, "Fallos durante la limpieza de la suite E2E");
  });

  test("1. sin sesión, /checkout redirige a la entrada con retorno", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/cuenta\/entrar\?redirigir=%2Fcheckout|\/cuenta\/entrar\?redirigir=\/checkout/);
  });

  test("2. con checkout_activo en false se ve el aviso de mantenimiento y ningún formulario", async ({ page, context }) => {
    await autenticarComoCliente(context, clienteA);
    await sql`UPDATE app_settings SET valor = 'false' WHERE clave = 'checkout_activo'`;

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: /mantenimiento/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /confirmar y solicitar pedido/i })).toHaveCount(0);
  });

  test("3. con checkout_activo en true se renderiza el formulario encadenado", async ({ page, context }) => {
    await autenticarComoCliente(context, clienteA);
    try {
      await sql`UPDATE app_settings SET valor = 'true' WHERE clave = 'checkout_activo'`;
      await page.goto("/checkout");

      await expect(page.getByRole("heading", { name: /dirección de entrega/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /facturación sat/i })).toBeVisible();
      await expect(page.locator('select[name="departamentoCodigo"]')).toBeVisible();
    } finally {
      await sql`UPDATE app_settings SET valor = 'false' WHERE clave = 'checkout_activo'`;
    }
  });

  test("4. la confirmación de Guatex muestra el texto aprobado y no abre WhatsApp", async ({ page, context }) => {
    await autenticarComoCliente(context, clienteA);
    let orderId = "";
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_GUATEX });

      await page.goto(`/checkout/confirmacion/${REF_GUATEX}`);
      await expect(page.getByRole("heading", { name: /¡solicitud recibida!/i })).toBeVisible();
      await expect(page.getByText(/nos pondremos en contacto contigo por whatsapp/i)).toBeVisible();
      await expect(page.getByText(`#${REF_GUATEX}`).first()).toBeVisible();
      await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    } finally {
      if (orderId) await borrarPedido(orderId);
    }
  });

  test("5. anti-IDOR: el cliente B recibe 404 en el pedido del cliente A", async ({ browser }) => {
    let orderId = "";
    const contextoB: BrowserContext = await browser.newContext();
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_DE_OTRO_CLIENTE });

      await autenticarComoCliente(contextoB, clienteB);
      const paginaB = await contextoB.newPage();

      // El pedido existe y es de A: si B lo viera, sería una fuga.
      const ajeno = await paginaB.goto(`/checkout/confirmacion/${REF_DE_OTRO_CLIENTE}`);
      expect(ajeno?.status()).toBe(404);

      // Y una referencia que no existe devuelve lo mismo, que es justo la gracia:
      // desde fuera no se distingue «no es tuyo» de «no existe».
      const inexistente = await paginaB.goto(`/checkout/confirmacion/${REF_INEXISTENTE}`);
      expect(inexistente?.status()).toBe(404);

      // Y el dueño legítimo sí lo ve: sin esto, la prueba pasaría también con un
      // pedido que no se hubiera creado nunca.
      const contextoA = await browser.newContext();
      try {
        await autenticarComoCliente(contextoA, clienteA);
        const paginaA = await contextoA.newPage();
        const propio = await paginaA.goto(`/checkout/confirmacion/${REF_DE_OTRO_CLIENTE}`);
        expect(propio?.status()).toBe(200);
        await expect(paginaA.getByText(`#${REF_DE_OTRO_CLIENTE}`).first()).toBeVisible();
      } finally {
        await contextoA.close();
      }
    } finally {
      await contextoB.close();
      if (orderId) await borrarPedido(orderId);
    }
  });

  test("6. el panel exige permiso y lista los pedidos", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    let orderId = "";
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_GUATEX });
      await page.goto("/admin/pedidos");

      await expect(page.getByRole("heading", { name: /pedidos y solicitudes de entrega/i })).toBeVisible();
      await expect(page.getByText(`#${REF_GUATEX}`)).toBeVisible();
    } finally {
      if (orderId) await borrarPedido(orderId);
    }
  });

  test("7. la ficha ofrece el enlace de WhatsApp sin datos sensibles", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    let orderId = "";
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_WHATSAPP });
      await page.goto(`/admin/pedidos/${orderId}`);

      const boton = page.locator('a[href*="wa.me"]');
      await expect(boton).toBeVisible();

      const href = await boton.getAttribute("href");
      expect(href).toMatch(/^https:\/\/wa\.me\/50255551122\?text=/);
      expect(href).toContain(REF_WHATSAPP);
      expect(href).not.toContain("Colonia");
      expect(href).not.toContain("NIT");
      expect(href).not.toContain("CUI");
    } finally {
      if (orderId) await borrarPedido(orderId);
    }
  });

  test("8. una transición administrativa persiste en la base de datos", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    let orderId = "";
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_TRANSICION });
      await page.goto(`/admin/pedidos/${orderId}`);

      await page.getByRole("button", { name: /marcar como contactado/i }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/pedidos/${orderId}`));

      const filas = await sql`SELECT status FROM orders WHERE id = ${orderId}`;
      expect(filas[0].status).toBe("contactado");
    } finally {
      if (orderId) await borrarPedido(orderId);
    }
  });

  test("9. una solicitud de Guatex con CF no se cierra sin verificar la fiscalidad", async ({ page, context }) => {
    await autenticarComoAdmin(context);
    let orderId = "";
    try {
      orderId = await crearSolicitudGuatex({ userId: clienteA.userId, reference: REF_TRANSICION });
      await sql`UPDATE orders SET status = 'contactado' WHERE id = ${orderId}`;
      await page.goto(`/admin/pedidos/${orderId}`);

      // Sin `fiscal_verificado`, el botón de cerrar ni siquiera se pinta.
      await expect(page.getByRole("button", { name: /cerrar pedido/i })).toHaveCount(0);
      await expect(page.getByText(/requiere verificación/i)).toBeVisible();

      // Se rectifica a NIT y entonces sí aparece.
      await page.locator('select[name="nuevoTipo"]').selectOption("nit");
      await page.locator('input[name="nuevoNumero"]').fill("1234567-K");
      await page.locator('input[name="nuevoNombre"]').fill("Empresa de Prueba S.A.");
      await page.getByRole("button", { name: /validar y marcar verificado/i }).click();

      await expect(page.getByRole("button", { name: /cerrar pedido/i })).toBeVisible();

      const filas = await sql`SELECT fiscal_tipo, fiscal_verificado FROM orders WHERE id = ${orderId}`;
      expect(filas[0].fiscal_tipo).toBe("nit");
      expect(filas[0].fiscal_verificado).toBe(true);
    } finally {
      if (orderId) await borrarPedido(orderId);
    }
  });
});
```

- [ ] **Paso 6: Registrar la suite en `playwright.config.ts`**
  - Añadir `"checkout-pedidos.spec.ts"` al array `testMatch`, después de `"envios-operativos.spec.ts"`.
  - Comprobar que `playwright.config.ts` mantiene la carga automática de variables mediante `loadEnvConfig(process.cwd())` de `@next/env` al inicio y la propagación de las 6 variables esenciales (`DATABASE_URL`, `NEON_RAMA_E2E`, `NEON_ENDPOINT_PRODUCCION`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`) en `webServer.env`.

- [ ] **Paso 7: Ejecutar la batería completa**
```bash
npm run test:datos
npm run test:admin
npm run test:proveedores
npm run typecheck
npm run lint
npm run build
npx playwright test tests/checkout-pedidos.spec.ts
```
  - La suite E2E requiere el emulador de Firebase Authentication en marcha (`npm run firebase:emuladores`) y las variables en `.env.local`.
  - **No requiere exportaciones manuales del operador:** gracias a `loadEnvConfig(process.cwd())` y la configuración de `webServer.env` en `playwright.config.ts`, Playwright y el servidor web Next.js heredan y cargan las credenciales automáticamente desde `.env.local` sin necesidad de ejecutar exportaciones manuales en la terminal antes de `npx playwright test tests/checkout-pedidos.spec.ts`.

- [ ] **Paso 8: Actualizar `CLAUDE.md` y `docs/CONTINUAR-PANEL.md`**
  - Registrar el estado del subproyecto 6: tablas nuevas, interruptor apagado, permisos
    de pedidos y qué queda bloqueado por la pasarela de pago.

- [ ] **Paso 9: Commit de la tarea 13**
  - Mensaje: `feat(admin): gestion de pedidos con permisos por rol y suite e2e con sesion real`

---

## 🛑 PARADA OBLIGATORIA

Una vez completadas las 13 tareas en la rama de desarrollo:

- Detenerse completamente.
- Prohibido hacer merge, push, aplicar migraciones en Producción o desplegar sin la
  autorización expresa del dueño.
- `checkout_activo` se queda en `'false'`. Encenderlo es una decisión del dueño y exige
  antes las credenciales de Firebase en Production, los textos legales definitivos y la
  pasarela de pago del subproyecto 7.
