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

## 3. Producción — sin resolver, y bloquea el despliegue

**Vercel no es infraestructura de Google**, así que allí no hay credenciales
predeterminadas de serie. Y como no se pueden generar claves de cuenta de servicio, la
solución habitual —pegar un JSON en las variables de entorno— **no está disponible ni se
va a buscar**.

El camino previsto es **Workload Identity Federation**: Vercel emite un testigo OIDC por
despliegue, Google lo acepta como identidad federada y entrega credenciales de corta
duración. Sin claves permanentes que robar ni rotar.

**Eso no está montado y no se monta todavía.** Es trabajo aparte, con su propia
verificación, y hay que hacerlo **antes de desplegar** cualquier cosa que dependa de
Firebase. Mientras tanto:

- Las pantallas de `/cuenta` **no pueden funcionar en producción**.
- El desarrollo local sí funciona, con ADC.
- No se añade ningún secreto a Vercel.

Cuando llegue el momento habrá que decidir, y dejarlo escrito aquí: qué identidad federada
se crea, qué condición de la afirmación OIDC de Vercel se acepta —el proyecto y el
entorno, no cualquier despliegue de cualquiera—, y qué rol mínimo se le concede.

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
