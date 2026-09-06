# Diseño correctivo de envíos y cierre de compra

**Fecha:** 04/09/2026 (actualizado con contrastes del código real: catálogo products.id text, identidad leerClienteActual, retorno a checkout, reglas fiscales SAT, deducción soberana transaccional inmune a TOCTOU, ProveedorPago desacoplado y permisos de administrador)

**Estado:** aprobado por el dueño

**Ámbito:** corrección del modelo de negocio de envíos de 9A y frontera con el subproyecto 6 (checkout, pedidos e identificación fiscal)

---

## 1. Propósito y precedencia

Este documento corrige y complementa la interpretación comercial de `2026-09-03-envios-tarifas-design.md`. La infraestructura geográfica, la seguridad, la auditoría y los invariantes de 9A siguen vigentes, pero dejan de ser válidas estas ideas:

- configurar tarifas fijas de Guatex por departamento o municipio;
- considerar cada departamento como una cobertura comercial editable;
- pedir al administrador que introduzca el importe exacto del envío para devolver al cliente al pago web;
- abrir WhatsApp en el dispositivo del cliente al terminar una solicitud de pedido;
- permitir checkout como invitado sin cuenta ni sesión activa;
- acoplar la regla fiscal de facturación al umbral promocional de envío gratuito.

En caso de contradicción, este documento prevalece para el cálculo del envío, la configuración administrativa, la identificación fiscal y el cierre de compra. Las tablas existentes de 9A (`shipping_zones`, `shipping_zone_areas`, `shipping_rates`) no se borran ni se transforman de forma destructiva: se conservan intactas en PostgreSQL para permitir recuperación y auditoría histórica, quedando sin nuevos consumidores.

---

## 2. Reglas de negocio definitivas

### 2.1 Mensajero propio
El mensajero propio solo presta servicio dentro del **municipio de Guatemala** (`departamento_codigo = '01'`, `municipio_codigo = '0101'`), según la zona capitalina seleccionada por el cliente.

- Pedido con subtotal de productos inferior a **Q2.500,00** (249.999 céntimos o menos): envío de **Q35,00** (3.500 céntimos).
- Pedido con subtotal de productos igual o superior a **Q2.500,00** (250.000 céntimos o más): **envío gratuito** (`envioCents: 0`, `gratuito: true`).
- La comparación del umbral es inclusiva: Q2.499,99 paga Q35,00; Q2.500,00 exactos no paga envío.
- El importe se calcula en centavos enteros y siempre con precios resueltos en el servidor contra el catálogo oficial (`products`).
- La regla comercial es editable desde el panel administrativo: se ofrecen controles numéricos para la tarifa de mensajero propio y el umbral de envío gratuito, guardados en `app_settings` (`envios_reglas_propias`) con auditoría en `audit_log`.
- Estos pedidos continúan dentro del checkout y se pagan digitalmente desde la web o las futuras aplicaciones, una vez contratada e integrada la pasarela de pago del subproyecto 7.

### 2.2 Zonas capitalinas atendidas por Guatex
Las zonas **6, 17 y 18** del municipio de Guatemala no tienen mensajero propio y se derivan a Guatex desde la configuración inicial.

El panel permitirá cambiar en el futuro cualquier zona capitalina de `mensajero_propio` a `guatex`, y también devolverla a `mensajero_propio` si la cobertura real vuelve. La selección será un desplegable cerrado; el administrador no escribirá nombres, códigos ni métodos a mano.

Las zonas admitidas son **1 a 19, 21, 24 y 25** (22 zonas en total). No existen ni se admiten las zonas 20, 22 ni 23. Cuando el municipio sea Guatemala, elegir una zona válida será obligatorio.

### 2.3 Resto de Guatemala
Cualquier destino fuera del municipio de Guatemala se deriva automáticamente a Guatex. El departamento y el municipio son obligatorios para:
- validar y normalizar la dirección del cliente mediante listas desplegables encadenadas;
- identificar con exactitud el destino de la entrega;
- entregar a ECONOLUZ la información necesaria para consultar el coste real con el transportista.

No sirven para asignar una tarifa fija ni para mantener una lista de cobertura de Guatex.

### 2.4 Guatex
El coste de Guatex depende del pedido y de su peso. ECONOLUZ no dispone de una tarifa fija fiable para calcularlo por departamento, por lo que la aplicación:
- **no estima el coste**;
- **no promete gratuidad**;
- **no permite pagarlo en línea**;
- **no solicita a un administrador que introduzca un importe para reanudar el checkout**.

El coste de envío de Guatex se representa como dato desconocido (`null`), **nunca como cero** (cero significaría erróneamente que el envío es gratuito). El pedido pasa a una solicitud en estado `pendiente_de_contacto` y la compra se finaliza directamente entre ECONOLUZ y el cliente por WhatsApp.

### 2.5 Recogida en tienda — decisión del dueño del 06/09/2026

**La recogida en tienda es un método de entrega real, gratuito y administrable.** El dueño
lo decidió el 06/09/2026, y esta redacción sustituye a la anterior, que ordenaba mantenerla
siempre apagada y fuera del flujo.

- Se activa y se desactiva desde **`/admin/envios`**, con la clave `recogida_en_tienda` de
  `app_settings` que ya existía. Nace **apagada** (`activa: false`), y sigue apagada
  mientras nadie la encienda: lo que cambia es que ahora se puede encender.
- Al activarla es **obligatorio** escribir la información para el cliente —dónde y cuándo
  recoger—, con un máximo de 200 caracteres. Ofrecer una opción que no explica nada sería
  peor que no ofrecerla.
- Su coste es **siempre Q0.00**. No es una tarifa de valor cero: es la ausencia de envío.
- **No pide dirección de entrega ni consulta la geografía.** No hay departamento, municipio
  ni zona capitalina que resolver, porque no hay nada que repartir.
- **No lleva plazo de entrega.** El plazo depende del proveedor, y este documento no
  inventa plazos.

#### Lo que `/checkout` deberá cumplir cuando se construya

Esto es un **requisito obligatorio** del futuro subproyecto 6, no una sugerencia:

1. `/checkout` **lee la configuración real del servidor** con `obtenerRecogidaEnTienda()`.
   No puede dar por hecho ningún valor ni guardarlo en el código.
2. Si `activa` es `true`, se ofrece al cliente exactamente como
   **«Recogida en tienda — Gratis»**, acompañada del texto que escribió el administrador.
3. Si `activa` es `false`, **no aparece como opción**. Ni apagada, ni deshabilitada, ni
   explicada: no está.
4. Elegirla **no pide dirección** ni pasa por la deducción de método de §5.2, y produce
   `{ tipo: "sin_coste", metodo: "recogida_en_tienda", envioCents: 0 }`, que es el contrato
   que ya devuelve `orquestar` hoy.
5. Nunca se elige por su cuenta como alternativa automática cuando otro método falla: es
   una decisión del cliente.

**Hoy no existe `/checkout`, y este documento no finge que exista.** El contrato del
dominio, la configuración y el panel están listos; la pantalla que se lo ofrece al cliente
se construye en el subproyecto 6.

---

## 3. Identidad, sesión y protección del checkout

### 3.1 Autenticación obligatoria del cliente y retorno seguro
- **Todo pedido exige una cuenta de cliente y una sesión activa.** No existe checkout como invitado.
- La identidad del cliente se obtiene exclusivamente mediante `leerClienteActual()` de `app/identidad/sesion.server.ts`, que devuelve `ClienteActual | null` con `id: string` (correspondiente a `users.id bigint` en PostgreSQL). Se prohíbe inventar funciones o envoltorios ficticios.
- Si la sesión no existe o caduca:
  1. El carrito persistente **no se pierde ni se vacía** (sigue anclado a la base de datos).
  2. El cliente es redirigido a la ruta de entrada con retorno: `/cuenta/entrar?redirigir=/checkout`.
  3. La ruta `/cuenta/entrar` es la ruta legítima de acceso al sistema. Sin embargo, para regresar automáticamente al checkout tras autenticarse, debe incluirse el parámetro `?redirigir=/checkout`.
  4. La página `app/cuenta/entrar/page.tsx` y el componente `app/cuenta/ClienteFirebase.tsx` consumen el parámetro `redirigir` validado por el módulo puro `app/cuenta/seguridadRedirigir.ts` (`sanitizarRutaRedirigir`) contra la lista blanca interna (`["/checkout", "/carrito", "/cuenta"]`), degradando de forma segura a `/cuenta` si no es válida.
  5. Tras autenticarse, el cliente regresa a `/checkout` con su sesión restaurada y su carrito intacto.
- La columna `orders.user_id` es obligatoria (`bigint NOT NULL REFERENCES users(id)`).
- **Aislamiento e IDOR:** cada cliente únicamente puede consultar sus propios pedidos. Toda consulta filtra estrictamente por `user_id = $1` usando el id de la sesión.
- **Separación estricta de identidades:** el panel administrativo (`/admin`) utiliza autenticación independiente con cookie `econoluz_admin` y tabla `admin_users`. Ambas identidades nunca se mezclan ni comparten sesiones.
- **La sesión del cliente no se fabrica, ni siquiera en pruebas.** `app/identidad/sesion.ts` define `COOKIE_SESION_CLIENTE = "econoluz_cliente"`, y `leerSesionDeCliente` la entrega a `verificarCookieDeSesion`, que llama a `auth().verifySessionCookie(cookie, true)` en `app/identidad/firebase.server.ts`. Solo vale una cookie emitida por Firebase mediante `crearCookieDeSesion`, y solo desde `POST /api/clientes/sesion`. Queda prohibido construir una cookie a mano —con JSON codificado en Base64 o de cualquier otra forma— y queda prohibido inventar un nombre de cookie distinto.
- **Autenticación E2E honesta.** Las pruebas de extremo a extremo obtienen un ID token válido del emulador de Firebase Authentication (o de credenciales E2E autorizadas), lo entregan a `POST /api/clientes/sesion` —que lo verifica, aprovisiona la fila de `users` por `firebase_uid` y devuelve la cookie— y a partir de ahí navegan como un cliente cualquiera. Si faltan el emulador, las credenciales o la configuración, la suite falla de forma explícita en vez de degradar a un atajo.

### 3.2 Protección del checkout apagado (`checkout_activo = false`)
- Todo el checkout debe quedar técnicamente construido, probado e integrado, pero **apagado por defecto en Producción** mediante la clave `checkout_activo = 'false'` en `app_settings`.
- La columna `app_settings.valor` es de tipo `text`. El valor se almacena como texto plano `'false'` o `'true'` (sin casting a jsonb).
- **Defensa en profundidad:** ocultar botones no es suficiente. Mientras `checkout_activo` sea falso:
  1. La página `/checkout` responde con estado de servicio no disponible o redirige a `/carrito` con un aviso informativo.
  2. Las Server Actions (`procesarCheckout`, etc.) y las APIs rechazan terminantemente cualquier mutación y se niegan a insertar filas en `orders`.
- **Independencia de confirmación:** la desactivación del checkout (`checkout_activo = 'false'`) bloquea el formulario de compra y la creación de nuevos pedidos, pero **NO impide que el cliente consulte la pantalla de confirmación `/checkout/confirmacion/[referencia]` de un pedido ya creado con anterioridad**, verificando siempre la titularidad (`orders.user_id = sesion.cliente.id`).
- **Degradación segura:** si la clave no existe en `app_settings`, está corrupta o la base de datos falla, el sistema degrada de forma segura a `false`. La comprobación no depende de middleware con acceso a PostgreSQL.
- **Independencia de DNS:** cambiar los registros DNS de `econoluzgt.com` hacia Vercel **no activa automáticamente el checkout**.
- **Requisitos previos de activación:** antes de activar `checkout_activo = 'true'` mediante autorización expresa del dueño, deben estar verificadas las credenciales de Firebase en Producción, los textos legales definitivos y los proveedores correspondientes.

### 3.3 Frontera con la pasarela de pago y secuencia transaccional
- No existe todavía una pasarela de pago contratada ni configurada (pertenece al subproyecto 7).
- Está estrictamente prohibido inventar una URL de pago externa o simular un cobro marcando pedidos como pagados.
- Se define una interfaz desacoplada `ProveedorPago` con comprobación previa:
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
- **Secuencia coherente de deducción soberana, disponibilidad y pago (inmune a condiciones de carrera TOCTOU):**
  1. **Deducción soberana única:** Solo existe una deducción soberana del método de envío para pedidos nuevos, y se realiza exclusivamente dentro de `crearPedidoTransaccional` bajo bloqueo `FOR SHARE` de `app_settings`. El orquestador no realiza ninguna deducción preliminar ni depende de una lista de zonas duplicada.
  2. **Recuperación idempotente previa:** Antes de evaluar configuración alguna, si ya existe un pedido para la tupla `(user_id, idempotency_key)`, se recupera y devuelve inmediatamente el pedido guardado según su propio `shipping_method` original. No se bloquea ni se re-evalúa contra la configuración actual de zonas o pasarela, garantizando que un cambio posterior de configuración en `app_settings` no altere ni impida consultar pedidos ya persistidos.
  3. **Comprobación síncrona de disponibilidad transaccional:** Para pedidos nuevos, una vez deducido el método definitivo dentro de la transacción y antes de cualquier `INSERT` en `orders`, `order_items` u `order_addresses` y antes de cualquier `DELETE` de `cart_items`, se comprueba síncronamente `estaConfigurado()` si el método definitivo deducido es `mensajero_propio`.
  4. **Sin llamadas de red en transacción:** No se realiza ninguna llamada de red externa dentro de la transacción de PostgreSQL.
  5. **Indisponibilidad tipada como valor de dominio sin mutaciones:** Si el método definitivo es `mensajero_propio` y la pasarela no está configurada (`estaConfigurado() === false`), la transacción finaliza con éxito (cero mutaciones: 0 INSERTs, 0 DELETEs, carrito 100% intacto) retornando directamente el valor de dominio tipado `{ ok: false, codigo: 'PAGO_NO_DISPONIBLE', error: 'El pago en línea no está disponible en este momento.' }`. No se lanza como excepción para evitar que `enTransaccion` de `app/lib/datos/transaccion` la degrade a `ErrorDeDatos("indisponible", ...)`, preservando el código de dominio exacto hasta la interfaz de usuario.
  6. **Ejecución de pago post-COMMIT:** Cuando exista un proveedor configurado (`estaConfigurado() === true`):
     - Se crea el pedido en estado `pendiente_de_pago`, se insertan líneas y direcciones, y se vacía el carrito dentro de la transacción de PostgreSQL.
     - La llamada a `iniciarPago` se realiza **únicamente después del COMMIT** exitoso de la transacción (nunca manteniendo la transacción abierta durante una llamada de red externa).
     - Si la llamada de red a `iniciarPago` falla después del `COMMIT`, el pedido se conserva en la base de datos en estado `pendiente_de_pago` como operación recuperable (`recuperable: true`), permitiendo al cliente reintentar el pago sin duplicar el pedido gracias a la clave de idempotencia y a la acción de reintento.

---

## 4. Regla fiscal de identificación (SAT Guatemala)

### 4.1 Marco legal y desvinculación comercial
- **Marco tributario:** Regulaciones de la SAT de Guatemala para emisión de Factura Electrónica en Línea (FEL).
- La SAT establece que **Consumidor Final (CF)** solo puede utilizarse en operaciones por importes menores de Q2.500,00. A partir de Q2.500,00 inclusive, la emisión de FEL exige obligatoriamente NIT, o CUI para personas individuales sin NIT.
- **Desacoplamiento estricto:** esta regla fiscal es completamente independiente de la promoción comercial de envío gratuito:
  - El umbral de envío gratuito es comercial, aplica solo sobre el subtotal de productos y es editable.
  - El umbral fiscal es legal, aplica sobre el **TOTAL FINAL FACTURADO** (productos + envío + cargos) y es inalterable en **Q2.500,00** (250.000 céntimos).

### 4.2 Criterios de identificación fiscal
- **Total final menor de Q2.500,00:**
  - Se permite **CF** (Consumidor Final).
  - Se permite **NIT**.
  - El cliente decide cuál ingresar.
- **Total final igual o superior a Q2.500,00:**
  - Se **prohíbe terminantemente CF**.
  - Se exige **NIT**; o
  - Se exige **CUI** (Código Único de Identificación de exactamente 13 dígitos numéricos) si la persona individual no dispone de NIT.
- **Validación local del NIT:** La comprobación en esta fase valida exclusivamente formato y caracteres permitidos (normalización); la validación fiscal sustantiva en tiempo real corresponderá a FEL cuando se integre.
- **Decisión comercial sobre identificaciones extranjeras:** Por decisión expresa del dueño, el sistema no ofrece opciones de pasaporte ni identificaciones tributarias extranjeras (no debe afirmarse erróneamente que la SAT lo prohíbe, sino que responde a una política del comercio).

### 4.3 Aplicación en Mensajero Propio
- Como el coste de envío es conocido (Q35,00 o Q0,00), el total facturado se conoce antes del pago.
- La validación fiscal se realiza en el servidor antes de cualquier paso de creación o cobro.
- *Ejemplo obligatorio:* productos por Q2.480,00 + envío por Q35,00 = **total Q2.515,00**. Como supera Q2.500,00, **CF es rechazado automáticamente**, exigiéndose NIT o CUI.

### 4.4 Aplicación en Guatex y Verificación Administrativa
- Como el coste del flete de Guatex se desconoce en la web:
  1. Si el subtotal de productos ya es igual o superior a Q2.500,00: se exige **NIT o CUI** directamente al registrar la solicitud. El pedido nace con `fiscal_verificado = true`.
  2. Si el subtotal de productos es inferior a Q2.500,00 y el cliente ingresa NIT o CUI: el pedido nace con `fiscal_verificado = true`.
  3. Si el subtotal de productos es inferior a Q2.500,00 y el cliente selecciona CF: el pedido nace con `fiscal_verificado = false`. La necesidad de verificación fiscal se deriva de la combinación: `shipping_method === 'guatex' && fiscal_tipo === 'cf' && !fiscal_verificado`.
- En el panel administrativo, un administrador autenticado comprueba por WhatsApp si el coste total con el flete de Guatex alcanzó o superó Q2.500,00:
  - Si no superó Q2.500,00: confirma administrativamente que CF sigue siendo legítimo y marca `fiscal_verificado = true` con auditoría.
  - Si alcanzó o superó Q2.500,00: actualiza la identificación a NIT o CUI con los datos recabados del cliente y marca `fiscal_verificado = true` con auditoría.
  - No se pide al administrador que introduzca un importe de flete inventado ni se devuelve al cliente a una pasarela web.
  - El panel prohíbe cerrar una solicitud Guatex con CF si no ha sido verificada fiscalmente.

### 4.5 Privacidad de datos fiscales
- Los números de NIT y CUI, nombres fiscales y teléfonos solo residen en tablas protegidas (`orders`, `order_addresses`).
- Queda prohibido imprimir o registrar NIT, CUI, teléfono o nombre en logs técnicos de la aplicación.

---

## 5. Flujo del cliente y experiencia de usuario

### 5.1 Dirección estructurada y selección de direcciones guardadas
El checkout ofrece:
1. **Selección de dirección:** si el cliente tiene direcciones previamente guardadas en `user_addresses`, se ofrece un selector para reutilizarlas o la opción de registrar una dirección nueva.
2. **Protección anti-IDOR:** si el cliente envía `direccionId`, el servidor valida estrictamente que pertenezca al cliente autenticado mediante `SELECT ... FROM user_addresses WHERE id = $1 AND user_id = $2`. `user_addresses.id` es `bigserial` (`db/009_identidad_clientes.sql`), así que el identificador recibido se valida como entero positivo, no como UUID; el único identificador con forma de UUID que valida el checkout es `idempotencyKey`, generado por la propia aplicación.
3. **Dirección nueva con controles encadenados:**
   - Departamento (desplegable oficial del catálogo INE).
   - Municipio (desplegable oficial filtrado por el departamento seleccionado).
   - Zona capitalina (desplegable obligatorio con las 22 zonas válidas únicamente cuando el municipio sea Guatemala).
   - Dirección exacta y referencias (texto libre).
4. Datos de contacto y selección de identificación fiscal (CF / NIT / CUI según el monto).

### 5.2 Decisión de ruta

Solo existe una deducción soberana del método para pedidos nuevos: la realizada dentro de `crearPedidoTransaccional` con `app_settings` (`envios_zonas_metodos`, `envios_reglas_propias`) bloqueado bajo `FOR SHARE`, eliminando carreras TOCTOU. No existe ninguna lista de zonas duplicada en el orquestador ni escrita en el código como respaldo.
La comprobación de disponibilidad (`estaConfigurado()`) del proveedor de pago corresponde exclusiva y síncronamente al método definitivo deducido dentro de la transacción, antes de cualquier mutación de pedido o vaciado de carrito.

| Destino | Método definitivo (en transacción) | Siguiente paso |
|---|---|---|
| Municipio de Guatemala y zona propia | `mensajero_propio` | Comprobar `estaConfigurado()`; validar fiscalidad sobre total exacto; crear pedido, COMMIT y continuar a `iniciarPago` |
| Municipio de Guatemala y zona Guatex | `guatex` | Validar fiscalidad sobre subtotal; guardar solicitud sin pasarela; pantalla de confirmación |
| Cualquier otro municipio del país | `guatex` | Validar fiscalidad sobre subtotal; guardar solicitud sin pasarela; pantalla de confirmación |

### 5.3 Solicitud de Guatex y pantalla aprobada
Cuando corresponde Guatex, el cliente pulsa **«Solicitar pedido»**. El servidor:
1. Bloquea el carrito del usuario (`carts ... FOR UPDATE`).
2. Si ya existe un pedido para la tupla `(user_id, idempotency_key)`, lo recupera y devuelve inmediatamente, conservando el estado y método con el que nació sin re-evaluar la configuración actual.
3. Si no existe, bloquea la configuración en `app_settings` con `FOR SHARE`, lee líneas de `cart_items` unidas con `products` (`FOR UPDATE OF ci`, columnas reales: `ci.cantidad`, `p.id`, `p.econoluz_reference`, `p.public_name`, `p.price_gtq`, `p.published`), recalcula subtotales bajo el bloqueo y valida la fiscalidad sobre el subtotal de productos (al ser el flete de Guatex desconocido, `shipping_cost_cents = null` y `total_cents = null`; si el subtotal de productos es igual o superior a Q2.500,00 se exige obligatoriamente NIT o CUI; si es inferior a Q2.500,00 con CF, nace con `fiscal_verificado = false`). El ejemplo de Q2.480,00 de productos + Q35,00 de envío = Q2.515,00 total pertenece exclusivamente al flujo de mensajero propio (§4.3), donde el coste de envío es conocido previamente.
4. Genera una referencia pública segura con prefijo `EC-` seguido de 10 caracteres criptográficos no ambiguos generados con `crypto` a partir del alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin 0, 1, I ni O, con distribución sin sesgo, ej. `EC-2K7M9P4XBW`). En la base de datos se protege la inserción ante colisiones con `SAVEPOINT sp_referencia` y `ROLLBACK TO SAVEPOINT sp_referencia` para no abortar la transacción de PostgreSQL durante los reintentos (hasta 3 intentos).
5. La persistencia se encapsula en el repositorio puro `app/pedidos/pedidosRepositorio.ts` (sin directivas de servidor, testeable con dobles en pruebas unitarias) e inyectado desde `app/pedidos/pedidos.server.ts`. La orquestación del checkout se estructura en el módulo puro `app/checkout/orquestacion.ts` y se expone en `app/checkout/checkout.server.ts`. Inserta pedido, líneas, dirección y auditoría, y vacía las líneas del carrito bloqueado.
6. Muestra la pantalla de confirmación exacta aprobada:

> **¡Solicitud recibida!**
>
> Hemos recibido tu pedido **#EC-2K7M9P4XBW**. Nos pondremos en contacto contigo por WhatsApp para finalizar la compra.

*(La pantalla renderiza la referencia real generada para ese pedido. Toda referencia que
aparezca en documentación, pruebas o fixtures cumple `^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$`:
el ejemplo corto de cuatro cifras del boceto comercial original queda derogado, porque
`chk_orders_reference_format` lo rechazaría.)*

**La pantalla no abre WhatsApp, no cambia de aplicación en el dispositivo del cliente y no simula mensajes entrantes.**

---

## 6. Panel administrativo de envíos y pedidos

### 6.1 Portada simplificada de envíos (`/admin/envios`)
Muestra exclusivamente:
- Resumen comercial: tarifa de mensajero propio (Q35,00) y umbral de gratuidad (Q2.500,00) con controles numéricos para su edición auditada en `app_settings`.
- Desglose de zonas: tabla de las 22 zonas capitalinas con selector cerrado entre `Mensajero propio` y `Guatex`.
- Recogida en tienda: interruptor para ofrecerla y el texto que ve el cliente, con su estado actual a la vista.
- Se retira el formulario de creación de zonas libres y la ruta `/admin/envios/[zona]` redirige a `/admin/envios`.

### 6.2 Gestión de pedidos y solicitudes (`/admin/pedidos`)
- **Máquina de estados cerrada (módulo puro `app/pedidos/estados.ts`):**
  - **Guatex:**
    - `pendiente_de_contacto` -> `contactado`
    - `pendiente_de_contacto` -> `cancelado`
    - `contactado` -> `cerrado` (requiere `fiscal_verificado = true`)
    - `contactado` -> `cancelado`
  - **Mensajero propio:**
    - Permanece en `pendiente_de_pago` hasta que el subproyecto 7 de pasarela de pago defina estados adicionales.
    - No puede cerrarse manualmente desde el panel simulando que fue pagado.
- **Acceso de lectura y consulta:** administradores y empleados autenticados con permiso `pedidos:leer` (`app/admin/auth/permisos.ts`), concedido a los roles `administrador` y `empleado`.
- **Acceso de escritura y transiciones:** exclusivo para administradores autenticados con permiso `pedidos:escribir` (`app/admin/auth/permisos.ts`), reservado al rol `administrador`.
- **Botón «Contactar por WhatsApp»:** visible únicamente en la ficha del pedido en el panel privado mediante el generador puro `app/admin/pedidos/enlaceWhatsapp.ts`. Abre en una nueva pestaña (`target="_blank" rel="noopener noreferrer"`) el enlace `https://wa.me/502XXXXXXXX?text=...` con el teléfono normalizado a dígitos y un texto seguro que incluye únicamente el saludo y la referencia del pedido. Nunca incluye NIT, CUI ni dirección.

---

## 7. Notificaciones y fiabilidad operativa

- **Persistencia durable:** la presencia de la solicitud en la base de datos con estado `pendiente_de_contacto` es la notificación durable primordial.
- **Aviso por correo (Resend):** se mantiene desacoplado y best-effort siguiendo el patrón real de `app/api/leads/route.ts`. Mientras falten las credenciales corporativas verificadas (`RESEND_API_KEY`, etc.), el envío de correo se omite registrando el aviso en el log del servidor. **Un fallo en el correo nunca revierte ni cancela el pedido.**
- **Atomicidad absoluta:** la creación del pedido, el guardado de líneas, la instantánea de dirección y el vaciado del carrito se ejecutan dentro de una única transacción con `escribir()`. Si ocurre un fallo en cualquier punto, se revierte todo (`ROLLBACK`) y el carrito del cliente permanece 100% intacto.
- **Idempotencia compuesta:** la restricción única `UNIQUE (user_id, idempotency_key)` asegura que peticiones repetidas o concurrentes no dupliquen pedidos ni vacíen carritos posteriores.

---

## 8. Pruebas y criterios de aceptación

### 8.1 Dominio y cálculo de envíos
- Q2.499,99 en mensajero propio produce Q35,00.
- Q2.500,00 y más en mensajero propio produce envío gratuito.
- Zonas 6, 17 y 18 empiezan en Guatex.
- Las demás 19 zonas admitidas empiezan en mensajero propio.
- Cambiar cualquier zona a Guatex altera pedidos nuevos.
- Fuera del municipio de Guatemala siempre se elige Guatex.
- Un método inventado por el navegador se ignora.
- Guatex devuelve coste desconocido (`null`), nunca Q0.

### 8.2 Integridad transaccional y prevención de condiciones de carrera (TOCTOU)
- **a) Lectura preliminar vs definitiva con pasarela sin configurar:** si la lectura transaccional definitiva bajo `FOR SHARE` en `app_settings` determina `mensajero_propio` y la pasarela no está configurada, la transacción finaliza sin insertar ninguna fila en `orders`, `order_items` u `order_addresses` y sin ejecutar ningún `DELETE` en `cart_items` (cero mutaciones, carrito 100% intacto).
- **b) Cambio de configuración hacia Guatex:** si la configuración definitiva determina `guatex`, el pedido se guarda como solicitud en `pendiente_de_contacto` y nunca se inicia pago en línea.
- **c) Repetición idempotente:** una repetición con la misma clave de idempotencia recupera el pedido guardado según su propio `shipping_method` original, aunque la configuración actual de la zona o de la pasarela haya cambiado posteriormente.
- **d) Mensajero propio configurado y llamada post-COMMIT:** un pedido nuevo de `mensajero_propio` con pasarela configurada se crea, hace `COMMIT` en base de datos y solo después invoca `iniciarPago`. Si `iniciarPago` falla tras el `COMMIT`, el pedido se conserva en `pendiente_de_pago` como recuperable.

### 8.3 Formularios, panel y roles
- Municipio depende del departamento y no se puede escribir libremente.
- Zona capitalina aparece y es obligatoria solo para el municipio de Guatemala.
- Solo aparecen las 22 zonas admitidas.
- El panel usa un desplegable cerrado para el método de cada zona.
- No existe una interfaz pública o administrativa para asignar tarifas fijas a Guatex.
- Permiso `pedidos:leer` permite consulta a `administrador` y `empleado`.
- Permiso `pedidos:escribir` para transiciones de estado está reservado a `administrador`.

### 8.4 Recorridos de navegador y cliente E2E
- Pedido local inferior al umbral continúa a pago con Q35,00.
- Pedido local en el umbral continúa a pago con envío gratuito.
- Zona 6, 17 o 18 guarda la solicitud y muestra el mensaje exacto sin abrir WhatsApp.
- Un municipio del interior sigue el mismo cierre por solicitud.
- El pedido aparece en el panel y el botón de contacto abre WhatsApp únicamente para el empleado con saludo y referencia pública `^EC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$`.
- Un fallo al guardar conserva el carrito y permite reintentar.

---

## 9. Fuera de alcance

- Integración técnica con Guatex o consulta automática de sus tarifas.
- Cálculo por peso, dimensiones o número de bultos.
- Pago en línea de pedidos enviados por Guatex.
- Contratación e integración definitiva de la pasarela de pago bancaria (subproyecto 7).
- Facturación FEL en tiempo real con certificador tributario (subproyecto 8).
- Automatización con WhatsApp Business Platform.
- Seguimiento del paquete y eventos del transportista, que pertenecen a 9B.
- Borrado destructivo de tablas, ramas, worktrees o datos existentes.
- Push, despliegue o escritura en Producción.

---

## 10. Resumen de la decisión

El catálogo geográfico sirve para capturar con precisión el destino, no para fingir que ECONOLUZ conoce el precio de Guatex. El mensajero propio tiene una regla única, transparente y transaccionalmente segura: la deducción soberana se realiza bajo bloqueo de ajustes en base de datos, evitando condiciones de carrera TOCTOU y asegurando que jamás se cree un pedido huérfano ni se vacíe el carrito si la pasarela no está disponible. Lo que el mensajero propio no cubre pasa a una solicitud guardada que el equipo atiende por WhatsApp. La tienda no pierde el carrito, no abre aplicaciones en el teléfono del cliente y nunca cobra un envío cuyo importe todavía desconoce.
