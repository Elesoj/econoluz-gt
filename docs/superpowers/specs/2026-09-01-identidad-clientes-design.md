# Identidad de clientes — diseño del subproyecto 2

> **Estado:** aprobado por el dueño el 01/09/2026. Es la especificación del subproyecto 2
> del rediseño aprobado en `docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md`.
> El plan de implementación se redacta aparte y **no se ha escrito código todavía**.

**Objetivo:** que un cliente pueda crear su cuenta, entrar, guardar sus direcciones y sus
datos fiscales, y borrarse de verdad; todo ello **sin tocar el acceso del panel
administrativo** y sin que nada de lo que ve hoy el visitante cambie.

**Lo que este subproyecto desbloquea:** el carrito persistente (subproyecto 5) y el
checkout (subproyecto 6). Sin identidad no hay carrito que persista ni pedido que
facturar.

---

## 1. Punto de partida, comprobado el 01/09/2026

`main` y `origin/main` están en `b5669c0`. El subproyecto 1 está terminado, fusionado y
desplegado: producción tiene aplicadas las ocho migraciones, `modelo_catalogo = legacy`,
313 productos con 25 precios y once tablas. La rama y el worktree
`feat/fundamentos-backend` se conservan a propósito.

Lo que condiciona este diseño:

- **El panel tiene su propia autenticación, y funciona.** `admin_users`, `admin_sessions`
  y `admin_login_attempts`, con `scrypt`, sesiones revocables con HMAC-SHA-256, límite de
  intentos y la cookie `econoluz_admin`. **No se modifica ni una línea.**
- **Existe una capa única de acceso a datos.** `app/lib/datos` es lo único que importa el
  controlador de Neon dentro de `app/**`, y una prueba lo vigila con la lista de
  excepciones vacía. Toda la identidad pasa por ahí.
- **El proyecto tiene cuatro dependencias de producción**: Neon, Blob, Next y React.
  `firebase-admin` sería la primera que se añade desde entonces.
- **`app/lib/ajustes.ts` ya ofrece una bandera persistente** en `app_settings`, y
  `audit_log` existe y está vacía. La identidad no necesita ninguna bandera nueva.

---

## 2. Decisiones tomadas el 01/09/2026

Las cinco se tomaron en la sesión de diseño, una pregunta cada vez.

| # | Decisión | Elegido |
|---|---|---|
| 1 | Conservación de la instantánea fiscal del pedido | Mientras exista la empresa, **provisional** (§6.3) |
| 2 | Conservación de los datos logísticos del pedido | Anonimización **a los doce meses** de la entrega |
| 3 | Borrado de cuenta | **Inmediato**, exigiendo reautenticación |
| 4 | Proveedores de acceso | **Correo y Google** ahora; Facebook preparado y apagado |
| 5 | Sesión web | **Cookie de sesión de Firebase**, cinco días, renovable con el uso |

La decisión 1 estaba señalada como pendiente en el diseño global (§7.4 y §11) y **este
documento la cierra**, con la salvedad del apartado 6.3.

---

## 3. Arquitectura

### 3.1 Dos identidades que no se tocan

El panel y los clientes son sistemas separados, sin puentes:

| | Panel administrativo | Clientes |
|---|---|---|
| Quién | ECONOLUZ y sus empleados | Quien compra |
| Identidad | `admin_users` en Neon | Firebase Authentication |
| Contraseñas | `scrypt`, en nuestra base | Firebase; nosotros no las vemos nunca |
| Sesión | Testigo propio con HMAC, cookie `econoluz_admin` | Cookie de sesión de Firebase |
| Rutas | `/admin/**` | `/cuenta/**` |
| Código | `app/admin/auth/**` | `app/identidad/**` |

**Ninguna tabla los relaciona y ninguna función los mezcla.** Un administrador que quiera
comprar se registra como cliente con su correo: son dos cuentas distintas y así debe
seguir siendo. Un puente entre ambos sistemas convertiría cualquier fallo del lado
público en un fallo del panel.

Esto se protege con una **prueba estructural**, del mismo tipo que la que vigila el
controlador de Neon: falla si un módulo de `app/identidad/**` o `app/cuenta/**` importa
algo de `app/admin/**`, o al revés. Sin esa prueba la separación es una buena intención
que el primer atajo se lleva por delante.

### 3.2 Reparto de responsabilidades

Firebase es la fuente de verdad de **quién eres**: credenciales, proveedores vinculados,
correo verificado, cuentas deshabilitadas y revocación de sesiones. Neon es la fuente de
verdad de **lo que es tuyo**: perfil, direcciones, consentimientos y eventos.

El punto de unión es `users.firebase_uid`. No hay ningún otro.

### 3.3 Estructura de archivos prevista

Sigue el reparto que el proyecto ya usa: módulos puros que reciben lo que necesitan, y un
`.server.ts` que conecta.

| Archivo | Responsabilidad |
|---|---|
| `app/identidad/firebase.server.ts` | La única puerta a `firebase-admin`; inicialización perezosa |
| `app/identidad/sesion.ts` | Política de la cookie: nombre, duración, renovación, opciones |
| `app/identidad/sesion.server.ts` | Emitir, verificar y borrar la cookie de sesión |
| `app/identidad/aprovisionamiento.ts` | Decidir qué fila de `users` corresponde a un token, en puro |
| `app/identidad/aprovisionamiento.server.ts` | El `upsert` idempotente contra Neon |
| `app/identidad/huella.ts` | La huella de IP y la familia del navegador |
| `app/identidad/eventos.ts` / `.server.ts` | Escritura de `auth_events` |
| `app/identidad/direcciones.ts` / `.server.ts` | Validación y consultas de `user_addresses` |
| `app/identidad/consentimientos.ts` / `.server.ts` | Versiones aceptadas y revocaciones |
| `app/identidad/anonimizacion.ts` | La política de borrado, pura y comprobable sin red |
| `app/identidad/anonimizacion.server.ts` | Su ejecución contra Firebase y Neon |
| `app/cuenta/**` | Las pantallas: entrar, registro, perfil y direcciones |
| `app/api/clientes/sesion/route.ts` | Canjear el ID token por cookie, y cerrar sesión |
| `app/api/clientes/borrar/route.ts` | El borrado de cuenta |
| `db/009_identidad_clientes.sql` | Las cuatro tablas |

**`firebase-admin` solo se importa desde `firebase.server.ts`.** Es la misma regla que
protege el controlador de Neon y por la misma razón: cuando la dependencia entra por un
solo sitio, cambiarla o simularla en pruebas es un trabajo acotado.

**`jose` no se usa para verificar tokens de Firebase.** El diseño global ya lo razona: se
necesita `firebase-admin` de todas formas para borrar usuarios, revocar sesiones y leer
proveedores vinculados, así que verificar a mano no ahorra una dependencia, solo añade una
implementación propia de criptografía que nadie audita.

---

## 4. Modelo de datos — migración `009_identidad_clientes.sql`

### 4.1 `users`

```sql
create table if not exists users (
  id                 bigserial   primary key,
  firebase_uid       text        not null unique,
  email              text        not null,
  email_verificado   boolean     not null default false,
  nombre             text        not null default '',
  telefono           text,
  nit                text,
  nombre_fiscal      text,
  estado             text        not null default 'activa',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_acceso_en   timestamptz,
  anonimizado_en     timestamptz,

  constraint users_estado_valido check (estado in ('activa', 'anonimizada')),
  constraint users_email_minusculas check (email = lower(btrim(email))),
  constraint users_anonimizada_tiene_fecha
    check ((estado = 'anonimizada') = (anonimizado_en is not null))
);

-- Un correo, una cuenta activa. Las anonimizadas quedan fuera del índice
-- porque su correo ya es un marcador y varias podrían repetirlo.
create unique index if not exists users_email_activo
  on users (email) where estado = 'activa';
```

**`firebase_uid` es identificador externo único, no clave primaria.** La clave interna es
`id`, y es la que usarán las claves foráneas de direcciones, consentimientos, carritos y
pedidos. Si algún día Firebase se sustituye, cambia una columna; con `firebase_uid` como
clave primaria habría que reescribir medio esquema.

El correo se guarda **normalizado en minúsculas y sin espacios**, con la misma restricción
que ya usa `admin_users`. No se hashea: hace falta legible para facturar y para escribirle
al cliente.

La restricción `users_anonimizada_tiene_fecha` impide el estado imposible de una cuenta
marcada como anonimizada sin fecha, o con fecha pero todavía activa.

**El índice `users_email_activo` exige en la base lo que Firebase promete:** un correo,
una sola cuenta. Firebase ya está configurado con una cuenta por dirección (§5.2), pero
esa garantía vive en un servicio ajeno y una configuración cambiada por descuido la
desactiva sin que nada se queje; aquí, un segundo registro con el mismo correo fallaría
al insertar. Es parcial —solo sobre las cuentas `activa`— porque quien se da de baja y
vuelve a registrarse con el mismo correo debe poder hacerlo: recibe un `uid` nuevo y una
fila nueva, y la anonimizada anterior no estorba.

### 4.2 `user_addresses`

```sql
create table if not exists user_addresses (
  id             bigserial   primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  destinatario   text        not null,
  telefono       text        not null,
  departamento   text        not null,
  municipio      text        not null,
  direccion      text        not null,
  referencias    text        not null default '',
  predeterminada boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists user_addresses_una_predeterminada
  on user_addresses (user_id) where predeterminada;
```

**Las referencias de ubicación no son un adorno.** En Guatemala buena parte de las
entregas dependen de «portón negro frente a la tienda» más que del número de casa. El
campo existe desde el primer día porque añadirlo después obliga a volver a preguntar a
todos los clientes ya registrados.

El índice parcial garantiza **una sola dirección predeterminada por cliente** en la base
de datos, no en el código: es la clase de invariante que el código olvida en cuanto hay
dos caminos de escritura.

### 4.3 `user_consents`

```sql
create table if not exists user_consents (
  id           bigserial   primary key,
  user_id      bigint      not null references users(id) on delete cascade,
  tipo         text        not null,
  version      text        not null,
  aceptado_en  timestamptz not null default now(),
  revocado_en  timestamptz,

  constraint user_consents_tipo_valido
    check (tipo in ('terminos', 'privacidad', 'comunicaciones'))
);
```

**Cada aceptación es una fila nueva y revocar no borra**, solo pone fecha. La prueba de
que alguien aceptó los términos de enero no puede desaparecer cuando cambien los de marzo:
es justamente lo que habría que enseñar si esa persona reclamara.

`version` es texto y no número porque los textos legales se versionan por fecha
(`2026-09-01`), que es lo que el aviso publicado enseñará.

### 4.4 `auth_events`

```sql
create table if not exists auth_events (
  id             bigserial   primary key,
  user_id        bigint      references users(id) on delete set null,
  tipo           text        not null,
  proveedor      text,
  resultado      text        not null,
  ip_huella      text,
  navegador      text,
  ocurrido_en    timestamptz not null default now(),

  constraint auth_events_tipo_valido
    check (tipo in ('registro', 'acceso', 'vinculacion', 'borrado', 'fallo')),
  constraint auth_events_resultado_valido
    check (resultado in ('correcto', 'fallido'))
);
```

`user_id` admite nulo y se pone a nulo al borrar la cuenta: el evento de que hubo un
acceso fallido sigue siendo útil aunque ya no haya a quién atribuirlo, y mantenerlo
enganchado a una cuenta borrada sería conservar identidad sin motivo.

### 4.5 Lo que estas tablas **no** llevan

- **No hay `roles` ni `user_roles`.** Todo cliente es cliente; los roles del panel son de
  `admin_users` y no de este subproyecto, según §5.2 del diseño global.
- **No hay tabla de perfiles fiscales.** El NIT vive en `users` y el pedido guardará su
  copia. Quien factura unas veces a su nombre y otras a su empresa lo edita en el
  checkout.
- **No hay contraseñas.** Las guarda Firebase y nosotros no las vemos jamás.
- **No hay tabla de sesiones.** La cookie de sesión la emite y verifica Firebase.

---

## 5. Flujos

### 5.1 Acceso y registro

1. El navegador se autentica contra Firebase con correo o con Google y recibe un ID token.
2. Lo envía a `POST /api/clientes/sesion`.
3. El servidor lo **verifica con `firebase-admin`** —nunca en el navegador, nunca con
   `jose`—, emite la cookie de sesión de cinco días y la devuelve como `httpOnly`.
4. En la misma petición **aprovisiona la fila de `users`**, dentro de `escribir()`:

   ```sql
   insert into users (firebase_uid, email, email_verificado, nombre)
   values ($1, $2, $3, $4)
   on conflict (firebase_uid) do update
     set email = excluded.email,
         email_verificado = excluded.email_verificado,
         ultimo_acceso_en = now(),
         actualizado_en = now()
   returning id, (xmax = 0) as recien_creada
   ```

5. Escribe `auth_events` con tipo `registro` o `acceso` según `recien_creada`.

`xmax = 0` es el modo habitual de distinguir en un `upsert` si la fila se acaba de crear,
pero **se apoya en una columna interna de PostgreSQL**, no en el estándar. Se usa porque
evita una consulta previa y una carrera, y **la prueba de integración contra la rama de
desarrollo tiene que comprobarlo de verdad**: primer acceso marcado como `registro`,
segundo como `acceso`. Si algún día deja de funcionar, la alternativa es comparar
`creado_en` con `actualizado_en` dentro de la misma transacción.

**El aprovisionamiento es perezoso a propósito.** No hay un paso de «registro» que pueda
fallar a mitad y dejar una identidad en Firebase sin fila en Neon: la fila aparece la
primera vez que hace falta. Y es idempotente: dos pestañas entrando a la vez producen un
usuario, no dos ni un error.

### 5.2 Vinculación de proveedores

El proyecto de Firebase se configura con **una sola cuenta por dirección de correo**. Sin
esa opción, la misma persona acabaría con tres cuentas y tres filas en `users`.

Quien se registró con correo y después entra con Google recibe de Firebase el aviso de que
ese correo ya tiene cuenta; la web pide la contraseña original y **vincula la credencial de
Google a la cuenta existente**. El servidor solo ve un `uid` con dos proveedores y una
sola fila en `users`. Se registra `auth_events` de tipo `vinculacion`.

**Facebook queda preparado y apagado.** El modelo admite cualquier número de proveedores
sobre el mismo `uid` sin cambios, así que activarlo más adelante será configurar el
proveedor en Firebase y añadir un botón; no un rediseño. No entra ahora porque su revisión
de aplicación depende de Facebook y no de nosotros, y bloquearía el camino hacia el
carrito y el checkout.

### 5.3 Borrado de cuenta

Se implementa desde el primer día porque **Apple y Google exigen que toda aplicación que
permita crear una cuenta permita borrarla desde dentro**. No es una preferencia: es
requisito de publicación.

1. La persona confirma y **vuelve a autenticarse**. Esto evita el clic accidental y que
   alguien con una sesión abierta ajena —un teléfono desbloqueado— destruya la cuenta.
2. **Primero Firebase**: revocar los tokens de refresco y eliminar el usuario.
3. **Después Neon**, dentro de una transacción: anonimizar `users`, borrar
   `user_addresses` con un `delete` explícito —el `on delete cascade` de la tabla no
   actúa, porque la fila de `users` no se borra—, dejar `user_consents` intacta,
   poner a nulo el `user_id` de `auth_events` y escribir el evento `borrado`.
4. Borrar la cookie de sesión.

**El orden es deliberado.** Si falla el segundo paso queda una fila con datos pero sin
identidad viva: un fallo recuperable y detectable. Al revés quedaría una identidad activa
sin sus datos, que es el peligroso, porque esa persona seguiría pudiendo entrar.

**La reconciliación se deduce del estado, no de una cola.** Un barrido busca filas
`activa` cuyo `firebase_uid` ya no existe en Firebase y termina de anonimizarlas. En
serverless, cualquier trabajo diferido que dependa de que un proceso llegue al final se
pierde en cuanto la función se apaga; una consulta que deduce el trabajo pendiente del
estado de los datos es idempotente y se recupera sola.

---

## 6. Datos sensibles y retención

### 6.1 Lo que no se guarda en claro

**La IP nunca se almacena tal cual.** `auth_events.ip_huella` guarda un HMAC-SHA-256 de la
dirección con una pimienta secreta de entorno (`AUTH_EVENT_IP_PEPPER`), truncado. Sirve
para lo único que necesitamos —ver que veinte intentos fallidos vienen del mismo sitio— y
no puede revertirse a la dirección original. Si la pimienta rota, las huellas anteriores
dejan de ser comparables con las nuevas: es un coste aceptado y queda escrito para que
nadie lo descubra por sorpresa.

Del navegador se guarda **la familia** (`Chrome en Android`), no la cadena completa, que
es en sí misma una huella identificativa.

**Ninguna contraseña, token, cookie de sesión ni cadena de conexión aparece en los
registros.** El registro estructurado de `app/lib/datos` solo admite escalares, y esa regla
se hereda aquí.

### 6.2 Qué ocurre al borrar la cuenta

| Dato | Qué se hace |
|---|---|
| Identidad en Firebase | **Se elimina de verdad**, con las sesiones revocadas antes |
| `users`: nombre, teléfono, NIT, nombre fiscal | Se vacían; `estado = 'anonimizada'` y `anonimizado_en = now()` |
| `users.email` | Pasa a `borrado+<id>@invalid`. El dominio `.invalid` está reservado por el RFC 2606 y no puede existir, así que nadie recibirá correo por error; el `<id>` lo hace único entre varias cuentas borradas |
| `users.firebase_uid` | Pasa a `borrado:<id>`. Determinista y único, sin parecerse a un `uid` real |
| `users`: `id` y la fila | **Se conservan**, sin datos personales, para no romper las claves foráneas de pedidos y facturas |
| `user_addresses` | Se borran |
| `user_consents` | Se conserva intacta: tipo, versión y fecha. No contiene datos personales propios, y cuelga de una fila de `users` que ya no los tiene |
| `auth_events` | `user_id` a nulo; el evento y su huella se conservan |

### 6.3 Retención de los pedidos — **decisión provisional**

Esta parte **se escribe aquí pero se aplica en el subproyecto 6**, cuando existan pedidos
que anonimizar. Se deja fijada ahora porque condiciona el modelo de aquel.

**La instantánea fiscal —NIT, nombre fiscal, líneas, importes y fecha— se conserva
mientras exista la empresa.** Es lo que la factura FEL ya contiene y lo que respalda a la
empresa ante la SAT.

> **Esta conservación indefinida es una decisión provisional, pendiente de validación con
> un asesor legal o contable de Guatemala.** Se razonó desde el marco que conocemos —el
> Código de Comercio para libros y registros, el Código Tributario para la prescripción—
> pero **no es asesoría legal**. Si el asesor fija un plazo concreto, se sustituye por ese
> plazo y se añade la purga correspondiente. El diseño no depende de que sea indefinida:
> depende de que el plazo sea un parámetro único y documentado.
>
> **Esta provisionalidad no se extiende a los datos logísticos**, cuyo plazo sí está
> decidido y cerrado en el párrafo siguiente.

**Los datos logísticos —dirección de entrega, referencias de ubicación y teléfono del
destinatario— se anonimizan a los doce meses de la entrega**, se haya borrado la cuenta o
no. Doce meses cubren de sobra devoluciones, garantías y reclamaciones. El pedido conserva
municipio y departamento, que sirven para saber dónde se vende sin identificar a nadie.

Ese barrido, cuando llegue, **deducirá el trabajo de las fechas** (`entregado_en < hoy −
12 meses`) en lugar de mantener una cola de tareas, por la misma razón de la §5.3.

### 6.4 Lo que hay que decirle al cliente

Como nada de lo fiscal se purga, **el «borrado de cuenta» es borrado de la identidad y del
perfil, no de todo rastro**. El aviso de privacidad debe decirlo con esas palabras. Apple y
Google aceptan la retención por obligación legal siempre que se declare; lo que no aceptan
es un borrado que no borra y no lo explica.

---

## 7. Seguridad

### 7.1 La sesión

Cookie de sesión emitida por Firebase a partir del ID token, con **cinco días de duración,
renovable con el uso**. `httpOnly`, `secure` en producción, `sameSite=lax` —hace falta laxa
para volver del redirigido de Google— y `path=/`.

**Las cuentas deshabilitadas y las sesiones revocadas se comprueban en cada verificación**,
no solo al entrar. La verificación se envuelve en `cache()` de React para no repetir la
consulta dentro de un mismo render, exactamente como ya hace `authorization.server.ts` del
panel.

Toda operación que muta comprueba el `Origin` de la petición. Las Server Actions de Next
ya traen su propia protección; las rutas de API la llevan explícita.

### 7.2 Correo verificado antes de pagar

Navegar y llenar el carrito no lo exige; **completar el pedido sí**. La razón es práctica:
la factura FEL se envía por correo, y un correo inventado significa una factura emitida que
no llega a nadie. La regla se define aquí y la exige el checkout, en el subproyecto 6.

### 7.3 El rol público no ve nada de esto

Las cuatro tablas nuevas se añaden a la lista de prohibidas de
`scripts/verificar-permisos.mjs`. `econoluz_publico` solo puede leer `public_products`, y
la prueba real contra la base debe confirmar que las cuatro **deniegan** la lectura, igual
que se confirmó con `app_settings` y `audit_log` en el subproyecto 1.

### 7.4 App Check

Queda **preparado y no obligatorio**: es una capa adicional contra el abuso automatizado,
nunca un sustituto de la autenticación. Activarlo es configuración y no cambia el modelo.

### 7.5 Límite de intentos

El límite de intentos de acceso lo aplica Firebase por su cuenta. Nosotros añadimos, sobre
`auth_events`, la detección de muchos fallos con la misma huella de IP en poco tiempo.
**No se reutiliza `admin_login_attempts`**: es del panel, y mezclarlos rompería la frontera
de la §3.1.

---

## 8. Errores, permisos e idempotencia

- **Los errores de Firebase se traducen** a tipos propios antes de salir del servidor, con
  la misma regla que ya aplica `traducirErrorDePostgres`: al navegador le llega qué pasó,
  no el detalle interno de quién lo dijo.
- **Un token inválido y un Firebase que no responde son cosas distintas.** El primero saca
  al visitante; el segundo es un fallo del servicio y no puede cerrar la sesión de todo el
  mundo. Es la misma distinción que `validateSessionToken` ya hace en el panel.
- **Todo el acceso a Neon pasa por `app/lib/datos`.** El aprovisionamiento y el borrado
  usan `escribir()`, porque encadenan varias sentencias que deben ir juntas.
- **Idempotencia:** el aprovisionamiento va por `on conflict`; borrar una cuenta ya
  borrada no falla ni duplica eventos; canjear dos veces el mismo ID token produce una
  sesión, no dos usuarios.

---

## 9. Pruebas y entornos

### 9.1 Niveles

| Nivel | Qué cubre |
|---|---|
| Unidad, `node:test` | Normalización de correo, política de la cookie, decisión de aprovisionamiento, política de anonimización, huella de IP, validación de direcciones y consentimientos |
| Doble inyectado | La verificación de tokens se prueba con un verificador falso, siguiendo el patrón del ejecutor que este proyecto usa en todas partes. **Las pruebas no llaman a Firebase** |
| Estructural | La frontera panel/clientes y la puerta única a `firebase-admin` |
| Integración | Contra una rama de Neon **nueva y aislada**, `identidad-clientes-dev` |
| Permisos | `test:permisos` con las cuatro tablas nuevas denegadas |
| Navegador | Playwright sobre las pantallas de `/cuenta` con un verificador de mentira; el flujo real contra Firebase se documenta como comprobación manual |

### 9.2 Entornos

- **Nunca se escribe en producción durante el desarrollo.** Toda migración y toda prueba
  real van primero contra `identidad-clientes-dev`.
- **Un proyecto de Firebase aparte para desarrollo**, distinto del de producción.
- **No hay claves privadas de cuenta de servicio, y no las habrá.** La organización
  `econoluz.net` lo prohíbe por política, y la política es correcta: una clave descargada
  es un secreto permanente que se copia, se pega en un chat y sobrevive a quien la creó.
  El servidor se autentica con **credenciales predeterminadas de la aplicación (ADC)**.
  - **En local**, las que deja `gcloud auth application-default login`, guardadas en el
    perfil del usuario y **nunca dentro del repositorio**.
  - **En producción, sin resolver.** Vercel no es infraestructura de Google y no tiene ADC
    de serie. Hará falta una identidad federada sin claves permanentes —**Workload
    Identity Federation** con los testigos OIDC de Vercel es el camino previsto—,
    montada **antes de desplegar** cualquier cosa que dependa de Firebase. Es trabajo
    aparte y **no entra en este subproyecto**. El procedimiento y su estado viven en
    `docs/OPERACION-FIREBASE.md`.
- Variables nuevas, todas fuera del repositorio: `FIREBASE_PROJECT_ID`, la configuración
  pública del cliente —que no es secreta: llega al navegador a propósito— y
  `AUTH_EVENT_IP_PEPPER`. Se documentan en `.env.example` **sin valores**.

---

## 10. Criterios de aceptación

1. Un cliente puede registrarse con correo, entrar, salir y volver a entrar, y el servidor
   sabe quién es al renderizar.
2. Un cliente puede entrar con Google y, si ese correo ya tenía cuenta, **vincula el
   proveedor sin crear una segunda fila** en `users`.
3. `firebase_uid` es único y **no es clave primaria**; las claves foráneas apuntan a
   `users.id`.
4. El aprovisionamiento es idempotente: dos peticiones simultáneas con el mismo token
   producen **un** usuario, y el primer acceso queda registrado como `registro` y el
   segundo como `acceso`.
5. **La base rechaza dos cuentas activas con el mismo correo**, comprobado
   intentándolo contra la rama de desarrollo. Y quien borra su cuenta **puede volver a
   registrarse con ese mismo correo**, comprobado igual.
6. Ningún token de Firebase se verifica fuera del servidor, y **`jose` no participa** en
   esa verificación.
7. `firebase-admin` se importa **solo** desde `app/identidad/firebase.server.ts` dentro de
   `app/**`, comprobado por prueba; en `scripts/**` las excepciones están declaradas una a
   una. **Ninguna clave privada de cuenta de servicio participa**: ni `cert()` ni
   `FIREBASE_PRIVATE_KEY` aparecen en el código, también comprobado por prueba.
8. **Ningún módulo de clientes importa código del panel, ni al revés**, comprobado por
   prueba. `admin_users`, `admin_sessions` y `admin_login_attempts` quedan **sin
   modificar**, comprobado con `git diff`.
9. Borrar la cuenta elimina la identidad en Firebase, revoca sus sesiones, anonimiza el
   perfil, borra las direcciones y conserva la prueba de los consentimientos.
10. Tras el borrado, **ningún dato personal del cliente queda legible** en `users`,
    `user_addresses` ni `auth_events`, comprobado leyendo las filas reales.
11. `auth_events` no contiene ninguna IP en claro, comprobado sobre las filas reales.
12. El rol `econoluz_publico` **deniega** las cuatro tablas nuevas, comprobado con
    `test:permisos` contra la base.
13. El catálogo público no cambia: siguen 313 productos, **25 precios** y
    `modelo_catalogo = legacy`; `catalogo:auditar` sigue en 0 coincidencias.
14. Las baterías completas pasan: unidad, `typecheck`, `lint`, `build` y Playwright.

---

## 10 bis. Contraste con el diseño global

Este documento desarrolla §5.2, §7.3, §7.4, §8.1 y §8.2 del diseño global y **no se aparta
de ninguna de sus decisiones**. Las cuatro tablas, sus campos, los tres apartamientos ya
razonados allí —ni `roles` ni `user_roles`, el NIT en `users`, y `auth_events` sin IP en
claro—, la verificación con `firebase-admin`, el correo verificado antes de pagar, la
comprobación de cuentas desactivadas en cada verificación, la cookie `httpOnly` y App Check
como capa adicional están recogidos tal cual.

**Dos apartamientos deliberados, ambos menores:**

1. **Las rutas no son las de la API v1.** El diseño global dibuja el flujo de registro
   contra `GET /api/v1/mi/perfil`. Aquí las rutas son `/api/clientes/sesion` y
   `/api/clientes/borrar`, porque **la API v1 es el subproyecto 10** y adelantar su
   contrato versionado obligaría a diseñarlo entero ahora. Cuando llegue, esas rutas se
   trasladan bajo `/api/v1` con su contrato; el modelo de datos y la lógica no cambian.
2. **`auth_events` admite un tipo más: `fallo`.** El global enumera registro, acceso,
   vinculación y borrado. El quinto hace falta para la detección de intentos repetidos de
   §7.5, y sin él esa detección no tendría de dónde leer.

Lo que este documento **cierra** y el global dejaba abierto: la política exacta de
retención y anonimización, que allí figura como decisión pendiente número 3.

---

## 11. Fuera de alcance

- **El catálogo relacional v2.** Es el subproyecto 3 y no se empieza aquí.
- **Carrito persistente, checkout, pagos, FEL y envíos.** Subproyectos 5, 6, 7, 8 y 9.
- **La API v1 completa.** Este subproyecto expone las rutas que necesita y nada más; el
  contrato versionado es el subproyecto 10.
- **Roles de administrador o de empleado.** Son de `admin_users` y no de los clientes.
- **Facebook activo.** Preparado, apagado.
- **Cualquier cambio en productos, categorías, precios, inventario o la fuente del
  catálogo público.** La bandera sigue en `legacy`.
- **La anonimización de pedidos.** Su política se fija aquí; se implementa en el
  subproyecto 6.

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una cuenta duplicada por proveedor | Firebase configurado con una cuenta por correo, más el criterio de aceptación 2 |
| El borrado deja la identidad viva y los datos fuera | Se borra **primero** en Firebase; el fallo posible es el recuperable |
| Un borrado a medias pasa desapercibido | Barrido de reconciliación que deduce el trabajo del estado, no de una cola |
| La frontera con el panel se erosiona con el tiempo | Prueba estructural que falla ante el primer atajo |
| `firebase-admin` no arranca en el entorno de Vercel | Se prueba en preview antes de producción; la inicialización es perezosa y su fallo no tumba el catálogo |
| El plazo de retención fiscal resulta ser otro | El plazo es un parámetro único y documentado (§6.3) |
| Guardar IP identificable sin querer | La huella es HMAC con pimienta y hay un criterio de aceptación que lo comprueba sobre las filas reales |

---

## 13. Decisiones que quedan abiertas

1. **Validación del plazo de retención fiscal** con un asesor legal o contable de
   Guatemala (§6.3). No bloquea la implementación de este subproyecto.
2. **Los textos legales** de términos, privacidad y comunicaciones, con su versión. El
   modelo los admite desde el primer día; el contenido lo escribe el dueño.
3. **Cuándo se activa Facebook.**
4. **Qué hacer si alguien borra su cuenta con un pedido en curso.** Se resuelve en el
   subproyecto 6, cuando existan pedidos; la propuesta será impedirlo hasta la entrega.

---

## 14. Lo que el dueño tiene que hacer

| Cuándo | Qué |
|---|---|
| Antes de implementar | Crear el proyecto de Firebase de **desarrollo** y activar correo y Google |
| Antes de implementar | Crear la rama de Neon `identidad-clientes-dev` |
| Antes de implementar | Generar `AUTH_EVENT_IP_PEPPER` y ponerla en `.env.local` |
| Antes de desplegar | Crear el proyecto de Firebase de **producción** y sus secretos en Vercel |
| Antes de desplegar | Publicar los textos legales con su versión |
| Al terminar | Autorizar la fusión y, por separado, el despliegue |

Nada de esto está hecho, y ninguno de estos pasos se da por autorizado por el hecho de
estar escrito aquí.

---

## 15. Historial

| Fecha | Cambio |
|---|---|
| 01/09/2026 | Documento inicial, con las cinco decisiones del dueño ya incorporadas: retención fiscal indefinida y provisional, anonimización logística a los doce meses, borrado inmediato con reautenticación, correo y Google con Facebook preparado, y cookie de sesión de Firebase de cinco días renovable |
| 01/09/2026 (ADC) | La organización `econoluz.net` prohíbe generar claves de cuenta de servicio, así que el servidor pasa a autenticarse con **credenciales predeterminadas (ADC)**: `gcloud` en local, y **Workload Identity Federation pendiente y bloqueante** para producción. Desaparecen `FIREBASE_PRIVATE_KEY` y `FIREBASE_CLIENT_EMAIL`; queda `FIREBASE_PROJECT_ID`. El criterio 7 se amplía para vigilar que nadie reintroduzca una clave |
| 01/09/2026 (revisión) | Tres correcciones antes de aprobar el plan. Faltaba el invariante de **un correo, una cuenta activa**: se añade el índice único parcial `users_email_activo` y su criterio de aceptación, porque la garantía vivía solo en la configuración de Firebase. Los marcadores de anonimización pasan de «un valor sin significado» a estar **especificados** (`borrado+<id>@invalid` y `borrado:<id>`). Y se deja dicho que `xmax = 0` se apoya en una columna interna de PostgreSQL, con la prueba real que debe cubrirlo y la alternativa si dejara de servir |
