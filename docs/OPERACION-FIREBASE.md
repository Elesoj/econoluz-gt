# Operación de Firebase para la identidad de clientes

Firebase Authentication guarda **quién es** cada cliente; Neon guarda **lo que es suyo**.
Este documento explica cómo se autentica el servidor contra Firebase, que es la parte
donde más fácil es equivocarse y dejar un secreto donde no debe.

**Nada de lo que sigue afecta al panel administrativo.** El panel tiene su propia
autenticación en Neon y no comparte ni una tabla ni una función con esto.

## 1. No hay claves privadas, y no las habrá

La organización `econoluz.net` **prohíbe por política generar claves de cuenta de
servicio**, y la política es correcta: una clave descargada es un secreto permanente que
se copia, se pega en un chat, viaja en una copia de seguridad y sobrevive a quien la
creó. No se pide ninguna excepción ni se desactiva la política.

En su lugar se usan las **credenciales predeterminadas de la aplicación** (ADC), que
`applicationDefault()` de `firebase-admin` resuelve por su cuenta. `app/identidad/firebase.server.ts`
es el único archivo del proyecto que las usa, y `tests/identidad-frontera.test.ts` vigila
que siga siendo así —y que nadie reintroduzca `cert()` ni una `FIREBASE_PRIVATE_KEY`—.

## 2. Desarrollo local

### 2.1 Instalar `gcloud`

El SDK de Google Cloud no viene con Windows. Se descarga de
`https://cloud.google.com/sdk/docs/install` y se instala con el asistente. Al terminar,
**abrir una consola nueva** para que el `PATH` se refresque; si no, `gcloud` parece no
existir aunque esté instalado.

```powershell
gcloud version
```

### 2.2 Autenticarse con la cuenta corporativa

Dos pasos, y son distintos. El primero identifica a la persona; el segundo deja las
credenciales que leen las bibliotecas, que es lo que necesita `firebase-admin`:

```powershell
gcloud auth login
```

```powershell
gcloud auth application-default login
```

El segundo abre el navegador y, al aceptar, escribe un archivo en el perfil del usuario
—`%APPDATA%\gcloud\application_default_credentials.json`—. **Ese archivo no entra jamás
en el repositorio**, y no hace falta copiarlo a ninguna parte: las bibliotecas lo
encuentran solas.

### 2.3 Fijar el proyecto de cuota

Sin esto, las llamadas se cobran a un proyecto que quizá no sea el nuestro, y algunas
fallan con un error poco claro sobre cuotas:

```powershell
gcloud auth application-default set-quota-project econoluz-dev-d30ab
```

### 2.4 Comprobar que funciona

```powershell
npm run identidad:adc
```

Comprueba dos cosas distintas, en este orden: que hay credenciales capaces de dar un
testigo de acceso, y que además **tienen permiso sobre Firebase Authentication** de este
proyecto. La primera sin la segunda es el fallo típico: la persona está autenticada, pero
su cuenta no tiene el rol necesario.

**El comando no imprime credenciales ni testigos**, solo si sirven.

### 2.5 Qué tiene que tener la cuenta

La cuenta corporativa con la que se inicia sesión necesita, sobre el proyecto
`econoluz-dev-d30ab`, un rol que permita administrar Firebase Authentication —**Firebase
Authentication Admin** basta—. Si `npm run identidad:adc` pasa el primer punto y falla el
segundo, el problema es ese rol, no las credenciales.

## 3. Vercel — federación y empaquetado demostrados en Preview

> **Estado al 01/09/2026.** La identidad federada **funciona y está demostrada** con una
> prueba positiva y una negativa, las dos ejecutadas de verdad; ver §3.2 y la sección 17
> del diseño. El bloqueo posterior de empaquetado también está resuelto y comprobado en
> un único Preview.
>
> ```
> Failed to load external module firebase-admin/auth: ERR_REQUIRE_ESM:
> require() of ES Module .../jwks-rsa/node_modules/jose/dist/webapi/index.js
> from .../jwks-rsa/src/utils.js not supported
> ```
>
> La causa era que Next 16.3.1 incluye `firebase-admin` en su lista automática de paquetes
> externos. La cadena `firebase-admin 14.3.0` → `jwks-rsa 4.1.0` → `jose 6.2.10` quedaba
> para el runtime y acababa pasando por `require()`. Añadir
> `transpilePackages: ["firebase-admin"]` a `next.config.ts` hizo que Turbopack empaquetara
> la cadena completa.
>
> La aserción de externalización falló antes del cambio y pasó después; el build local
> trazó cero archivos externos de los tres paquetes. El build remoto del Preview
> `dpl_HByQNb3hyHfX9kdnptp6TAkoBjBH` terminó correctamente y `/cuenta` respondió `307`
> hacia `/cuenta/entrar`. Vercel registró `λ GET /cuenta` en nivel `info`, sin
> `ERR_REQUIRE_ESM`. No se usó el plan B de fijar `jose` v5.
>
> **Desde el 02/09/2026 hay una prueba que lo protege.** `transpilePackages` es una línea
> cuya desaparición no se nota en local —el build pasa y las pruebas también— y solo rompe
> dentro de una función desplegada, así que `tests/identidad-frontera.test.ts` comprueba
> que `firebase-admin` sigue declarado ahí, y `next.config.ts` lleva el comentario que
> explica por qué y advierte de no quitarla sin comprobarlo en un despliegue. La prueba se
> rompió a propósito, borrando la línea, para verla fallar antes de darla por buena.

**Vercel no es infraestructura de Google**, así que allí no hay credenciales
predeterminadas de serie. Y como no se pueden generar claves de cuenta de servicio, la
solución habitual —pegar un JSON en las variables de entorno— **no está disponible ni se
va a buscar**.

El camino previsto es **Workload Identity Federation**: Vercel emite un testigo OIDC por
despliegue, Google lo acepta como identidad federada y entrega credenciales de corta
duración. Sin claves permanentes que robar ni rotar.

La federación del entorno Preview ya está montada y restringida a ese entorno. El
desarrollo local sigue usando ADC. La infraestructura separada de Production —proyecto
Firebase, federación, migración y variables— aún no existe y solo se prepara con
autorización expresa.

Las tres decisiones que faltaban —qué identidad federada se crea, qué condición de la
afirmación OIDC de Vercel se acepta y qué rol mínimo se concede— **ya están tomadas y
escritas**, con su fuente oficial, en
`docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md`. El plan para
ejecutarlas está en `docs/superpowers/plans/2026-09-01-vercel-firebase-wif.md`.

### 3.1 Comprobaciones previas — 01/09/2026

Antes de crear nada se comprobaron las tres condiciones que podían tumbar el diseño. Las
tres salieron favorables, y conviene repetirlas si alguna vez deja de funcionar.

| Qué | Resultado |
|---|---|
| `constraints/iam.workloadIdentityPoolProviders`, efectiva sobre `econoluz-dev-d30ab` | `allValues: ALLOW`. La organización **no restringe** los emisores OIDC, así que `oidc.vercel.com` es admisible **sin tocar ninguna política** |
| Permisos de `administrador@econoluz.net` sobre el proyecto | `roles/owner`: puede crear el pool, el proveedor, el rol personalizado y la cuenta de servicio |
| Vercel, *Settings → Security → Secure Backend Access with OIDC Federation* | Disponible, con el modo de emisor ya en **Team** |

Se confirmó además que `constraints/iam.disableServiceAccountKeyCreation` está en
`enforced: true`. La política que prohíbe las claves privadas **existe, está activa y no
se toca**.

Los valores que salieron de ahí, ninguno secreto:

| Dato | Valor |
|---|---|
| Número del proyecto de Google | `629521051305` |
| Equipo de Vercel (slug) | `joseangel-s-projects` |
| Proyecto de Vercel | `econoluz-gt` |
| Emisor OIDC | `https://oidc.vercel.com/joseangel-s-projects` |

**Faltaban tres API por activar** en `econoluz-dev-d30ab`, y ya se activaron el
01/09/2026; sin ellas la federación no puede montarse: `iam.googleapis.com` (crear el pool
y el proveedor),
`sts.googleapis.com` (el canje del testigo) y `iamcredentials.googleapis.com` (suplantar
la cuenta de servicio). `identitytoolkit.googleapis.com` sí está activa.

La CLI de Vercel no está instalada en la máquina y el proyecto no está enlazado. No hace
falta instalarla: se usa `npx vercel`.

### 3.2 Recursos creados — 01/09/2026

Creados en `econoluz-dev-d30ab`, todos sin ninguna clave:

| Recurso | Estado |
|---|---|
| API `iam`, `sts` e `iamcredentials` | Activadas |
| Pool `vercel` (global) | `ACTIVE` |
| Rol `econoluzIdentidadServidor` | Creado con **cuatro permisos**: `firebaseauth.users.get`, `users.createSession`, `users.update`, `users.delete` |
| Cuenta `econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com` | Creada. Tiene **un solo rol**, el personalizado. Ni Owner, ni Editor, ni `firebaseauth.admin` |
| `roles/iam.workloadIdentityUser` sobre esa cuenta | Concedido a los principales de `environment:preview` y, **temporalmente**, `environment:development` |

El **proveedor OIDC `vercel`** quedó creado y `ACTIVE`, con el emisor
`https://oidc.vercel.com/joseangel-s-projects`, sin audiencias permitidas —usa la
predeterminada del proveedor— y con esta condición de atributos:

```
assertion.owner_id == 'team_Dsl9K7DahJEa1bYTq3aQaoQ4' &&
assertion.project_id == 'prj_RQAemyVYK4hWVhTOuFG32WvyYoG8' &&
assertion.environment == 'preview'
```

El enlace temporal de `environment:development` **ya se retiró**: solo la identidad de
`preview` puede suplantar la cuenta.

**La federación está demostrada, no supuesta.** La prueba positiva pasó los tres puntos y
la negativa devolvió `unauthorized_client: The given credential is rejected by the
attribute condition`. La evidencia completa está en la sección 17 del diseño.

### 3.3 Dos trampas que costaron tiempo y conviene no repetir

**`npx vercel link` escribe en `.env.local` por su cuenta.** Descarga un
`VERCEL_OIDC_TOKEN` y lo añade al final con un comentario `# Created by Vercel CLI`, sin
admitir otro nombre de archivo. No borró nada, pero dejó un testigo donde no debía. El
procedimiento seguro es calcular la huella del archivo antes y después
—`(Get-FileHash .env.local -Algorithm SHA256).Hash`— y restaurarlo hasta que vuelva a
coincidir. Para descargar el entorno se usa **siempre** un nombre explícito:
`npx vercel env pull .env.vercel.local`.

**Las dos audiencias no se escriben igual.** Al testigo se le pide la URL con `https://`;
al Security Token Service se le pasa el nombre de recurso, que empieza por `//`. Con la
URL responde `Invalid value for "audience"`. Lo normaliza
`app/identidad/credencial.ts` y lo cubren tres pruebas.

## 4. El proyecto de Firebase

| | Desarrollo | Producción |
|---|---|---|
| Proyecto | `econoluz-dev-d30ab` | sin crear |
| Credenciales del servidor | ADC de `gcloud` | Workload Identity Federation, **pendiente** |
| Proveedores | Correo y Google | los mismos |
| Facebook | preparado, apagado | preparado, apagado |

**Una sola cuenta por dirección de correo.** En *Authentication → Settings*, la opción de
vinculación debe ser la que **enlaza** las cuentas que comparten correo, no la que crea
una por proveedor. Sin ella, la misma persona acabaría con tres cuentas y tres filas en
`users`, y el modelo de datos da por hecho que eso no pasa.

## 5. Variables de entorno

Ninguna es una clave privada.

| Variable | Dónde | Para qué |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `.env.local` del worktree | A qué proyecto pertenecen los tokens que se verifican. Sin ella, `firebase-admin` podría apuntar a otro proyecto |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `.env.local` | Configuración del navegador. **No es secreta**: llega al cliente a propósito |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `.env.local` | Igual |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `.env.local` | Igual |
| `AUTH_EVENT_IP_PEPPER` | `.env.local` | Pimienta de la huella de IP. **Sí es secreta.** Sin ella no se guarda huella: nunca se guarda la IP en claro |

`FIREBASE_PRIVATE_KEY` y `FIREBASE_CLIENT_EMAIL` **no existen en este proyecto**, y la
prueba de frontera falla si alguien las reintroduce.

---

## 6. El emulador de Authentication para las pruebas E2E (04/09/2026)

Las pruebas de Playwright que necesitan un cliente con sesión —hoy
`tests/envios-operativos.spec.ts`— se autentican **de verdad**. Conviene entender por
qué no hay atajo antes de intentar uno.

`app/identidad/sesion.ts` define `COOKIE_SESION_CLIENTE = "econoluz_cliente"`, y
`leerSesionDeCliente` la entrega a `verificarCookieDeSesion`, que llama a
`auth().verifySessionCookie(cookie, true)`. Solo vale una cookie emitida por Firebase,
y además la cuenta tiene que existir en `users` con su `firebase_uid`. Una cookie
inventada —un JSON en Base64, por ejemplo— no la acepta ninguna página real: la prueba
que la usara estaría comprobando el atajo, no la aplicación.

El camino que siguen las pruebas es el mismo que el del navegador de un cliente:

1. Piden un **ID token** al emulador por su API REST.
2. Se lo entregan a `POST /api/clientes/sesion`, que lo verifica con `verificarIdToken`,
   aprovisiona la fila de `users` con `aprovisionarCliente` y responde con la cookie que
   emite `crearCookieDeSesion`.
3. A partir de ahí navegan como cualquier cliente.

### 6.1 Levantar el emulador

En una consola aparte, y dejarlo corriendo:

```bash
npx firebase-tools emulators:start --only auth --project econoluz-dev-d30ab
```

No hace falta `firebase login` ni un `firebase.json`: el emulador de Authentication
funciona con la configuración por defecto y avisa de ambas cosas sin fallar. Tampoco
necesita Java, a diferencia de los emuladores de Firestore o Pub/Sub.

Escucha en `127.0.0.1:9099`. Se puede comprobar con una petición cualquiera a
`http://127.0.0.1:9099/`, que responde `200`.

### 6.2 Por qué `firebase-admin` habla con él

`firebase-admin` reconoce el emulador por la variable `FIREBASE_AUTH_EMULATOR_HOST` y
enruta contra él tanto `verifyIdToken` como `createSessionCookie` y
`verifySessionCookie`. Se puede leer en
`node_modules/firebase-admin/lib/auth/auth-api-request.js`, donde el constructor de la
URL del emulador es
`http://{host}/identitytoolkit.googleapis.com/{version}/projects/{projectId}{api}`.

Ese mismo prefijo expone la API REST de cliente, así que crear el usuario y pedir su ID
token es una llamada HTTP a
`http://{FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp`.

### 6.3 Variables que hay que dar de alta

Van en el `.env.local` del worktree, y están documentadas en `.env.example`.

| Variable | Para qué |
|---|---|
| `FIREBASE_AUTH_EMULATOR_HOST` | Host y puerto del emulador, `127.0.0.1:9099`. La leen `firebase-admin` y el servidor de desarrollo que levanta Playwright |
| `E2E_FIREBASE_API_KEY` | Clave de API que acepta la REST del emulador. Con el emulador vale cualquier cadena no vacía; se declara para no esconder el requisito |
| `FIREBASE_PROJECT_ID` | Ya existía. Sin ella `app/identidad/firebase.server.ts` lanza a propósito |
| `NEON_RAMA_E2E` | Nombre sellado de la rama de Neon, el mismo que guarda `app_settings.rama_neon` |
| `NEON_ENDPOINT_PRODUCCION` | Ya existía. Se usa para rechazar Producción |

`playwright.config.ts` carga `.env.local` con `loadEnvConfig` de `@next/env` antes de
definir la configuración, y propaga esas seis variables a `webServer.env`. Así el
proceso de las pruebas y el subproceso del servidor reciben exactamente lo mismo, y
nadie tiene que exportar nada a mano en la consola.

### 6.4 Sin emulador no hay atajo

Si falta `FIREBASE_AUTH_EMULATOR_HOST`, `E2E_FIREBASE_API_KEY` o `FIREBASE_PROJECT_ID`,
`tests/helpers/cliente-e2e.ts` lanza un error explícito y la suite se detiene. La
alternativa —credenciales E2E autorizadas contra `econoluz-dev-d30ab`— usa exactamente
el mismo camino cambiando el destino de la llamada REST. Lo que no se admite es una
tercera vía que se salte `POST /api/clientes/sesion`.

**La base tampoco se da por buena porque «no sea Producción».** `exigirRamaE2E` lee el
marcador `app_settings.rama_neon` y exige que coincida con `NEON_RAMA_E2E`: estas
pruebas escriben de verdad, y un endpoint mal configurado podría apuntar a cualquier
otra rama con datos que importen.
