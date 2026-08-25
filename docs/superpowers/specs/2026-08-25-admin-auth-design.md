# Diseño del acceso al panel de administración

Fecha: 25/08/2026  
Estado: aprobado por el dueño; plan de implementación redactado
Rama: `panel-admin`

## 1. Objetivo y alcance

Construir la entrada segura a `/admin` con varios usuarios, contraseñas protegidas,
sesiones revocables guardadas en Neon y limitación persistente de intentos fallidos.
Este bloque deja preparada la frontera de seguridad que usarán después el panel de
productos, la subida de imágenes y la galería de proyectos.

Incluye:

- esquema de usuarios, sesiones e intentos fallidos;
- creación y recuperación de administradores desde la terminal;
- inicio y cierre de sesión;
- renovación de la sesión con actividad real;
- autorización reutilizable para páginas y Server Actions;
- pantalla inicial protegida y pantalla de acceso con identidad ECONOLUZ;
- pruebas automáticas que no escriban en la base de datos operativa;
- instrucciones para aplicar la migración y crear el primer administrador.

No incluye gestión de usuarios desde el navegador, recuperación por correo, roles,
doble factor, panel de productos ni cambios en el catálogo público.

## 2. Decisiones cerradas

- Se implementa autenticación propia con la biblioteca estándar de Node y Neon. No se
  añade ninguna dependencia.
- Puede haber varios administradores. No existe registro público.
- Las contraseñas usan `crypto.scrypt`; los tokens aleatorios de sesión usan
  HMAC-SHA-256 con `ADMIN_SESSION_SECRET`.
- La sesión caduca después de 12 horas sin actividad y se renueva con actividad real.
- Los intentos fallidos se cuentan en Postgres, no en memoria de la instancia.
- El límite inicial es de cinco fallos durante quince minutos por combinación de correo
  normalizado y origen.
- La función de autorización cercana a los datos es la frontera de seguridad. El layout
  protegido solo anticipa la redirección y comparte la interfaz del panel.
- `/admin/entrar` permanece fuera del grupo de rutas protegido.
- La cookie es `httpOnly`, `sameSite: "lax"`, limitada a `/admin`, con caducidad y con
  `secure` activado únicamente en producción.
- Ninguna prueba automática crea usuarios, sesiones o intentos en la base de datos
  operativa configurada en `.env.local`.

## 3. Modelo de datos

La migración `db/003_admin.sql` crea tres tablas.

### `admin_users`

- `id`: identificador numérico.
- `email`: correo único, recortado y almacenado en minúsculas.
- `password_hash`: resultado de `scrypt`, codificado para almacenamiento.
- `salt`: sal aleatoria independiente por contraseña.
- `name`: nombre mostrado en el panel.
- `created_at`: fecha de alta.
- `last_login_at`: último acceso correcto.
- `active`: permite retirar el acceso sin borrar el usuario.

### `admin_sessions`

- `token_hash`: HMAC-SHA-256 del token, clave primaria. El token real nunca se guarda.
- `user_id`: usuario propietario, con borrado en cascada.
- `created_at`: inicio de la sesión.
- `expires_at`: límite móvil de 12 horas desde la última actividad renovada.

Habrá índices por `user_id` y `expires_at`. Al validar una sesión se eliminarán las
filas ya caducadas para que la tabla no crezca indefinidamente.

### `admin_login_attempts`

- `key_hash`: HMAC-SHA-256 de correo normalizado y origen, sin guardar ninguno en claro.
- `failure_count`: fallos dentro de la ventana vigente.
- `window_started_at`: comienzo de la ventana de quince minutos.
- `blocked_until`: final del bloqueo cuando se alcanza el límite.
- `updated_at`: última modificación, útil para limpiar registros antiguos.

El incremento se hará de forma atómica en Postgres. Un acceso correcto eliminará el
contador correspondiente. Los registros antiguos se limpiarán durante el mismo flujo,
sin cron ni infraestructura adicional.

## 4. Criptografía y secretos

### Contraseñas

Cada contraseña recibe una sal generada con `randomBytes`. Se deriva con `scrypt` y se
compara con `timingSafeEqual`. Si el correo no existe se ejecuta igualmente una
comparación contra valores ficticios válidos para reducir diferencias de tiempo que
permitan enumerar usuarios.

El script rechazará contraseñas de menos de doce caracteres. No impondrá reglas de
mayúsculas o símbolos que favorezcan patrones previsibles; permitirá frases largas.

### Sesiones

El navegador recibe un token de 32 bytes generado con `randomBytes` y codificado como
`base64url`. Neon recibe únicamente:

```text
HMAC-SHA-256(ADMIN_SESSION_SECRET, token)
```

`ADMIN_SESSION_SECRET` debe ser un valor hexadecimal aleatorio de 32 bytes, definido
en `.env.local` y en Vercel. La aplicación no arrancará silenciosamente con un secreto
por defecto.

## 5. Rutas y frontera de autorización

La estructura prevista mantiene las URL públicas sin paréntesis:

```text
app/admin/
  layout.tsx                    metadata `noindex` y envoltorio común
  entrar/page.tsx               acceso público
  actions.ts                    entrar y salir
  sesion/route.ts               renovación autenticada por actividad
  SessionActivity.tsx           detector mínimo de actividad, sin datos de negocio
  (panel)/layout.tsx            cabecera y redirección temprana
  (panel)/page.tsx              inicio protegido del panel
  auth/
    types.ts                    contratos compartidos sin dependencias de Next
    crypto.ts                   primitivas puras de contraseña, token y HMAC
    policy.ts                   duración, límites y normalización
    repository.ts               adaptador SQL inyectable y comprobable
    repository.server.ts        conexión Neon y variables; marcado `server-only`
    login.ts                    caso de uso de entrada y bloqueo
    session.ts                  validar y renovar sesiones sin depender de Next
    authorization.server.ts     `verificarSesion()` y autorización de acciones
```

`verificarSesion()` se memoizará con `cache` de React durante cada render. Primero lee
la cookie; si no existe, no consulta Neon. Si existe, calcula su HMAC, elimina sesiones
caducadas, busca una sesión vigente unida a un usuario activo y devuelve solo `id` y
`name`. Si falla, redirige a `/admin/entrar`.

Todas las páginas protegidas llamarán a esa función antes de leer datos. Toda Server
Action llamará a una variante para acciones que vuelve a verificar y puede renovar la
cookie. El layout protegido también la llama, pero no se considera una barrera.

El layout raíz de `/admin` declarará `robots: { index: false, follow: false }`. El panel
no se añadirá a ningún sitemap. El botón flotante público de WhatsApp quedará oculto en
las rutas administrativas sin alterar su comportamiento en el sitio público.

## 6. Inicio y cierre de sesión

El formulario de `/admin/entrar` envía correo y contraseña a una Server Action. No hay
Route Handler de credenciales ni JavaScript que reciba hashes o datos del usuario.

Flujo de entrada:

1. Normalizar y validar tamaño y forma de los campos.
2. Calcular la clave anónima de intentos con correo y origen.
3. Rechazar temporalmente si el contador está bloqueado.
4. Buscar un usuario activo y verificar la contraseña, usando el trabajo ficticio si
   el usuario no existe.
5. Ante un fallo, incrementar el contador y devolver el mismo mensaje genérico.
6. Ante un acierto, borrar el contador, actualizar `last_login_at`, crear la sesión y
   escribir la cookie.
7. Redirigir a `/admin` fuera de cualquier bloque `try/catch`.

La respuesta genérica será «No se pudo iniciar sesión con esos datos». Cuando el límite
esté activo podrá añadir «Inténtalo de nuevo dentro de unos minutos» sin revelar si el
correo existe.

La acción de salida verifica la sesión, elimina su fila por `token_hash`, elimina la
cookie con los mismos atributos y redirige a `/admin/entrar`.

## 7. Renovación por actividad

La caducidad es móvil: doce horas desde la última renovación aceptada. Para evitar una
escritura en cada render, Neon solo ampliará `expires_at` cuando hayan pasado al menos
quince minutos desde la última renovación.

`SessionActivity` no recibe información de productos ni del proveedor. Observa
interacciones reales como teclado, puntero y envío de formularios. Al detectar actividad
solicita la renovación a `POST /admin/sesion`, con un límite adicional en el navegador.
El Route Handler valida el token contra Neon antes de actualizar la fila y la cookie.
Una pestaña abierta sin interacción no genera renovaciones.

Las Server Actions administrativas también verifican y renuevan cuando corresponde.
Así, escribir durante un periodo largo conserva la sesión y guardar nunca confía en una
comprobación antigua del layout.

## 8. Script de administración

`scripts/create-admin.mjs`, expuesto como `npm run admin:crear`, pedirá nombre, correo y
contraseña. La contraseña y su confirmación se leerán sin mostrar caracteres en la
terminal. El script:

- exige que `DATABASE_URL` exista;
- normaliza el correo;
- crea el usuario si no existe;
- actualiza nombre, contraseña y estado si ya existe;
- invalida todas sus sesiones al cambiar la contraseña;
- nunca imprime la contraseña, el hash, la sal ni las cadenas de conexión.

No habrá una pantalla pública de alta ni recuperación.

## 9. Interfaz y errores

La entrada y la cabecera protegida usarán azul marino `#001B59`, rojo `#E11133` y blanco
según `CLAUDE.md` §3. El rojo se reservará para la acción principal. Se reutilizarán los
componentes existentes cuando encajen, sin convertir la pantalla en una plantilla gris
genérica.

Los errores de credenciales y bloqueo serán deliberadamente genéricos. Un fallo de
configuración o de Neon se registrará en el servidor sin exponer detalles y mostrará
«El panel no está disponible temporalmente». Los campos conservarán el correo, nunca la
contraseña. La navegación por teclado, las etiquetas y el foco visible serán obligatorios.

## 10. Estrategia de pruebas

Se añadirá un comando basado en `node:test`, aprovechando Node 24 y el cargador TypeScript
que ya existe. Las pruebas unitarias cubrirán:

- normalización y validación de correo;
- derivación y comparación de contraseñas;
- rechazo seguro de hashes con longitudes inválidas;
- generación y HMAC del token;
- caducidad inicial, expiración y umbral de renovación;
- contador, reinicio de ventana y bloqueo;
- estados del flujo de entrada mediante un repositorio falso inyectado.

Playwright comprobará sin escribir en Neon:

- redirección de `/admin` sin cookie;
- renderizado y accesibilidad básica de `/admin/entrar`;
- `noindex`;
- ausencia del widget público de WhatsApp en administración;
- permanencia del comportamiento público existente.

Después de aplicar la migración y crear el administrador se hará una verificación manual
real: acceso correcto, rechazo incorrecto con el mismo mensaje, renovación, cierre de
sesión y comprobación de que la fila quedó invalidada. No se introducirán credenciales
fijas ni un modo de autenticación alternativo para las pruebas.

## 11. Operación y entrega

El código y las pruebas pueden completarse sin publicar. Para activar el acceso harán
falta, en este orden:

1. Generar `ADMIN_SESSION_SECRET` localmente.
2. Añadirlo a `.env.local` sin versionarlo.
3. Ejecutar `npm run db:migrar` para aplicar `db/003_admin.sql`.
4. Ejecutar `npm run admin:crear` e introducir las credenciales en la terminal.
5. Verificar el flujo en local.
6. Con autorización explícita del dueño, añadir el mismo secreto a Vercel y desplegar.

No se hará push, despliegue, modificación de Vercel ni publicación como parte de la
implementación sin una confirmación específica.

## 12. Criterios de aceptación

- `/admin` redirige a `/admin/entrar` sin una sesión válida.
- Todas las páginas y acciones administrativas verifican la sesión cerca del acceso a
  los datos.
- Credenciales correctas crean una sesión y credenciales incorrectas no revelan qué
  campo falló.
- Cinco fallos en quince minutos activan el bloqueo persistente.
- La actividad renueva la sesión sin mantener viva una pestaña abandonada.
- Doce horas sin actividad invalidan la sesión.
- Salir y cambiar la contraseña revocan las filas correspondientes.
- El panel no es indexable y no muestra el widget público de WhatsApp.
- No hay secretos ni datos del proveedor en chunks públicos.
- Pruebas unitarias, `npm run typecheck`, `npm run lint` y la batería Playwright quedan
  verdes salvo el fallo histórico ya documentado en `catalog-quote.spec.ts:891`.

---

## 13. Estado final de la implementación (25/08/2026)

**Implementado y verificado en la rama `panel-admin-auth`**, sin fusionar, sin push y
sin desplegar. Commits `f0d2186..6e47fb9`, uno por tarea.

Resultados reproducibles:

| Comprobación | Resultado |
|---|---|
| `npm run test:admin` | 44/44 |
| `npm run typecheck` | limpio |
| `npm run lint` | limpio |
| `npm run build` | correcto; `/admin`, `/admin/entrar` y `/admin/sesion` son dinámicas |
| `npx playwright test tests/admin-auth.spec.ts` | 5/5 |
| `npx playwright test tests/catalog-production-boundary.spec.ts` | 4/4 |
| `npx playwright test` (completa) | 92 pasan, 1 falla: el histórico `catalog-quote.spec.ts:891` |

**Revisión por mutaciones.** Se alteró cada condición de seguridad para comprobar que
alguna prueba lo detecta. Seis de siete quedaron cubiertas: aceptar cualquier
contraseña (3 fallos), ignorar el secreto de la HMAC (1), renovar sin mirar la
caducidad (1), no contar los fallos de acceso (2), poner `secure: true` en desarrollo
(1) y devolver el WhatsApp público a `/admin` (1).

**La séptima no está cubierta:** quitar `verificarSesion()` de la página protegida y
dejar la comprobación solo en el layout **no hace fallar ninguna prueba**. No es un
descuido de las pruebas: sin `DATABASE_URL` local no existe forma de montar una sesión
válida en el navegador, así que solo se puede ejercitar el camino sin sesión, donde el
layout ya redirige. Queda cubierto por revisión de código y **debe comprobarse a mano
al activar el acceso contra Neon**.

Los criterios de la sección 12 que dependen de una sesión real —renovación por
actividad, caducidad a las doce horas, bloqueo tras cinco fallos y revocación al
salir— están implementados y probados en unidad contra un repositorio en memoria, pero
**no se han ejercitado contra Neon**, porque la migración todavía no se ha aplicado.

## 14. Activación real (25/08/2026)

El acceso dejó de ser teórico: la migración está aplicada en Neon, el secreto está en
`.env.local` y existe el primer administrador. Se entró en `/admin` desde el navegador.

Dos fallos aparecieron en ese primer uso real y están corregidos:

1. **`scripts/create-admin.mjs` moría con `Cannot find package 'server-only'`**, justo
   después de pedir la contraseña. El paquete no está instalado; Next lo resuelve con un
   alias propio, así que el build y las pruebas de navegador pasaban mientras el camino
   de terminal estaba roto. El script usa ahora el adaptador puro y se conecta antes de
   preguntar nada.
2. **El logo era invisible sobre el azul marino.** El logotipo lleva `#001B59` y estaba
   puesto sobre ese mismo color. En toda la web el logo va sobre blanco; el panel ahora
   también.

Sigue pendiente **añadir `ADMIN_SESSION_SECRET` a Vercel**. Sin eso, el panel no
funcionará en el sitio publicado. No se ha hecho push, ni merge, ni despliegue.

