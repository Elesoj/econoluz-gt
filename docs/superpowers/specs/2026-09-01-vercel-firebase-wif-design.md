# Credenciales federadas de Vercel a Firebase Admin — diseño

**Fecha:** 01/09/2026 · **Subproyecto:** 2, identidad de clientes · **Rama:** `feat/identidad-clientes`
**Estado:** diseño aprobado por el dueño, pendiente de plan de implementación.

Este documento resuelve el **último bloqueo del subproyecto 2**: cómo se autentica
`firebase-admin` desde Vercel sin que exista, en ninguna parte, una clave privada de
cuenta de servicio.

Todas las duraciones, nombres de afirmaciones, emisores, audiencias, roles, permisos y
comandos que aparecen aquí están comprobados contra la documentación oficial **consultada
el 01/09/2026**, y cada decisión importante lleva su fuente en la sección 15. Lo que no se
ha podido comprobar aparece marcado como **sin comprobar**, no rellenado con lo que
parecía razonable.

---

## 1. Resumen

Vercel firma, por despliegue, un testigo OIDC de corta duración. Google lo acepta como
identidad federada mediante **Workload Identity Federation**, comprueba de qué equipo, qué
proyecto y qué entorno viene, y a cambio entrega un testigo de acceso temporal de una
cuenta de servicio con **cuatro permisos** sobre Firebase Authentication. No hay ninguna
credencial permanente que robar, rotar ni pegar en un panel.

En desarrollo local **no cambia nada**: se sigue usando `applicationDefault()` con las
credenciales que deja `gcloud`.

El alcance de este diseño es **Preview contra `econoluz-dev-d30ab`**. Producción sigue
bloqueada, pero por un motivo distinto y mucho menor: falta crear su proyecto de Firebase.
Deja de estar bloqueada por no saber si la federación funciona.

---

## 2. Qué problema resuelve, y qué no

La organización `econoluz.net` **prohíbe por política generar claves de cuenta de
servicio**, y la política es correcta. Este diseño **no pide ninguna excepción y no propone
desactivarla en ningún punto**.

Sin claves, la solución habitual —pegar el JSON de una cuenta de servicio en las variables
de entorno de Vercel— no está disponible. Y Vercel no es infraestructura de Google, así que
ahí no hay credenciales predeterminadas de serie. De ahí el bloqueo.

**Lo que este diseño resuelve:** que una función de Vercel obtenga credenciales temporales
válidas para Firebase Authentication.

**Lo que no resuelve, y sigue pendiente en su propia tarea:**

- Crear el proyecto de Firebase de producción y configurarlo entero.
- Fusionar, publicar o desplegar el subproyecto 2.
- Cualquier cosa del subproyecto 3.

---

## 3. Arquitectura

### 3.1 Los dos testigos, que no son el mismo

La confusión más fácil de cometer aquí es tratar como una sola cosa dos testigos que tienen
emisor, formato, duración y función distintas. **Son dos.**

| | Testigo OIDC de Vercel | Testigo de acceso de Google |
|---|---|---|
| Quién lo emite | `https://oidc.vercel.com/[EQUIPO]` | `iamcredentials.googleapis.com` |
| Qué demuestra | «esta ejecución pertenece a tal equipo, proyecto y entorno de Vercel» | «el portador puede actuar como la cuenta de servicio» |
| Ante quién sirve | Solo ante el Security Token Service de Google | Ante las API de Google, incluida Firebase Authentication |
| Cómo llega al código | Cabecera `x-vercel-oidc-token` de la petición | Se obtiene canjeando el anterior |
| Duración | Preview y Production: **dos horas**. Development: **doce horas**. Build: **una hora** | Corta; la mide la propia prueba, ver 10.4 |

El primero **no vale para hablar con Firebase**: es solo la prueba de identidad que se
entrega a Google. El segundo es el que autoriza de verdad, y es el que fija la ventana de
revocación de la sección 12.

Dentro de las funciones, Vercel **no emite un testigo nuevo por ejecución**: reutiliza uno
durante un máximo de **90 minutos**, y la media hora que le sobra hasta las dos horas de
vida existe para que no caduque a mitad de una ejecución larga.

> **La arquitectura no depende de estas duraciones concretas.** Depende de que los testigos
> sean temporales y de que se renueven automáticamente. Si Vercel o Google cambian las
> cifras mañana, no hay que tocar nada: ni el código, ni los recursos, ni este diseño más
> allá de esta tabla.

### 3.2 El camino completo

```
Navegador
   │
   ▼
Función de Vercel (runtime Node, entorno Preview)
   │  cabecera  x-vercel-oidc-token
   │  JWT RS256 firmado por  https://oidc.vercel.com/[EQUIPO]
   ▼
getVercelOidcToken({ audience })            ← @vercel/oidc
   │
   ▼  POST https://sts.googleapis.com/v1/token
Security Token Service de Google
   │  · verifica la firma contra el JWKS del emisor
   │  · exige que iss y aud sean los del proveedor
   │  · APLICA LA CONDICIÓN DE ATRIBUTOS  ──►  rechaza otro equipo,
   │                                            otro proyecto u otro entorno
   ▼  testigo federado
POST …iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/[SA]:generateAccessToken
   │  · exige roles/iam.workloadIdentityUser sobre esa cuenta
   ▼  testigo de acceso OAuth2 de la cuenta de servicio
Credential { getAccessToken }  →  initializeApp({ credential, projectId })
   ▼
Firebase Authentication  (identitytoolkit.googleapis.com)
```

En local el camino es el de siempre y no pasa por ninguna de estas cajas:

```
gcloud auth application-default login  →  %APPDATA%\gcloud\…json  →  applicationDefault()
```

---

## 4. Decisiones tomadas, y por qué

### 4.1 Suplantación de cuenta de servicio, no acceso directo del principal federado

Google permite dos formas de usar una identidad federada: conceder roles directamente al
principal externo, o que el principal suplante a una cuenta de servicio. **Se elige la
suplantación.**

Es el camino que Vercel documenta para GCP, y el único sobre el que no hay duda. Google
afirma que «la mayoría» de sus API admiten federación, pero no publica una lista donde se
pueda leer que Identity Toolkit —la API que hay detrás de Firebase Authentication— esté
entre ellas. Con suplantación, quien habla con Firebase es una cuenta de servicio normal y
corriente, y el soporte deja de ser una pregunta abierta.

Cuesta un salto de red más y una cuenta de servicio que mantener. A cambio, la parte
incierta desaparece del diseño.

### 4.2 La audiencia predeterminada del proveedor, no `https://vercel.com/[EQUIPO]`

Google recomienda expresamente usar como audiencia la URL del propio proveedor del pool:
*«Requiring tokens and assertions to use this URL as the audience helps reduce the risk of
a confused deputy attack»*.

La alternativa —admitir la audiencia por defecto de Vercel, `https://vercel.com/[EQUIPO]`—
es más sencilla y no exige tocar el código, pero significa que **cualquier testigo del
equipo emitido para cualquier otro servicio tiene la audiencia que nuestro pool acepta**. La
condición de atributos seguiría frenando a otros proyectos, pero el testigo entra por la
puerta antes de que la condición lo eche. Con la audiencia del proveedor no llega ni a la
puerta.

Coste: `getVercelOidcToken({ audience })` hace una llamada extra a Vercel para canjear el
testigo por otro con esa audiencia. Ocurre aproximadamente una vez cada 90 minutos por
instancia, no en cada petición.

### 4.3 Modo de emisor **Team**, no Global

Con el modo Team, el emisor es `https://oidc.vercel.com/[EQUIPO]`, propio del equipo. Con
Global es `https://oidc.vercel.com`, compartido con **todos los clientes de Vercel**: el
proveedor tendría que aceptar un emisor tras el cual hay cualquiera, y toda la seguridad
recaería en la condición de atributos. Vercel recomienda Team, y aquí se usa Team.

Hay que fijarlo antes de crear el proveedor, en *proyecto → Settings → Security → Secure
backend access with OIDC federation*.

### 4.4 Identificadores estables en la condición, nombres solo en el enlace

Vercel avisa de que **renombrar el equipo o el proyecto cambia las afirmaciones del
testigo**. La afirmación `sub` lleva nombres; `owner_id` y `project_id` llevan los
identificadores estables (`team_…`, `prj_…`).

Por eso la condición de atributos —la que decide si el testigo entra— se escribe sobre
`owner_id` y `project_id`, que no cambian nunca. El enlace del principal sí usa `sub`,
porque es lo que Google mapea a `google.subject`. Consecuencia práctica: **si algún día se
renombra el proyecto en Vercel, `/cuenta` deja de funcionar de golpe y con un error claro**,
no de forma silenciosa. Queda anotado en la sección 13.

### 4.5 Nunca un respaldo hacia una credencial más privilegiada

Si en Vercel faltan las variables de la federación, el código **no cae hacia
`applicationDefault()`**: lanza un error de configuración y `/cuenta` deja de funcionar de
forma ruidosa. Es la misma regla que ya gobierna `app/data/origenPublico.ts` con el rol
público de Neon, y por el mismo motivo: un respaldo que sea más privilegiado que el camino
normal quita la barrera sin que nadie se entere.

---

## 5. Recursos externos que hay que crear

Todos dentro del proyecto **`econoluz-dev-d30ab`**. Ninguno genera ni necesita una clave.

| # | Recurso | Identificador |
|---|---|---|
| 1 | Workload Identity Pool | `vercel`, ubicación `global` |
| 2 | Proveedor OIDC dentro del pool | `vercel` |
| 3 | Rol personalizado | `econoluzIdentidadServidor` |
| 4 | Cuenta de servicio | `econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com` |
| 5 | Enlace IAM en el proyecto | la cuenta (4) recibe el rol (3) |
| 6 | Enlace IAM en la cuenta | `roles/iam.workloadIdentityUser` para el principal federado |

### 5.1 El proveedor OIDC (recurso 2)

- **Issuer URI:** `https://oidc.vercel.com/[EQUIPO]`
- **Audiencia:** la predeterminada del proveedor,
  `https://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/providers/vercel`
- **Archivo JWK:** vacío. Google descubre las claves por el punto `.well-known` del emisor.
- **Mapeo de atributos:**

  ```
  google.subject=assertion.sub
  attribute.owner_id=assertion.owner_id
  attribute.project_id=assertion.project_id
  attribute.environment=assertion.environment
  ```

- **Condición de atributos:**

  ```
  assertion.owner_id == "[TEAM_ID]" &&
  assertion.project_id == "[PROJECT_ID]" &&
  assertion.environment == "preview"
  ```

`google.subject` tiene un límite de **127 bytes**. El valor real,
`owner:[EQUIPO]:project:[PROYECTO]:environment:preview`, ronda los 55 y no se acerca al
límite, pero conviene recordarlo si algún día cambian los nombres.

### 5.2 El enlace del principal (recurso 6)

```
principal://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/subject/owner:[EQUIPO]:project:[PROYECTO]:environment:preview
```

Son **dos cierres independientes** sobre el mismo camino: la condición del proveedor y el
enlace del principal. Un testigo de otro equipo, otro proyecto u otro entorno choca contra
los dos, y basta con que falle uno para que no se obtenga nada.

### 5.3 Lo que NO se crea

- Ninguna clave de cuenta de servicio, en ningún formato.
- Ningún JSON de credenciales dentro del repositorio.
- Ningún testigo permanente en ninguna variable de entorno.

---

## 6. Permisos mínimos

### 6.1 Lo que el código usa de verdad

Se ha revisado operación por operación, no por categorías:

| Operación de `firebase-admin` | Dónde | Permiso |
|---|---|---|
| `verifyIdToken(idToken, true)` — el `true` comprueba revocación leyendo la cuenta | `firebase.server.ts` | `firebaseauth.users.get` |
| `createSessionCookie(idToken, …)` | `firebase.server.ts` | `firebaseauth.users.createSession` |
| `verifySessionCookie(cookie, true)` | `firebase.server.ts` | `firebaseauth.users.get` |
| `revokeRefreshTokens(uid)` | `firebase.server.ts` | `firebaseauth.users.update` |
| `deleteUser(uid)` | `firebase.server.ts` | `firebaseauth.users.delete` |
| `getUser(uid)` | `scripts/reconciliar-identidades.mjs`, **solo local** | `firebaseauth.users.get` |
| `listUsers(1)` | `scripts/comprobar-adc.mjs`, **solo local** | `firebaseauth.users.get` |

**Cuatro permisos distintos.** El rol personalizado `econoluzIdentidadServidor` contiene
exactamente estos y nada más:

```
firebaseauth.users.get
firebaseauth.users.createSession
firebaseauth.users.update
firebaseauth.users.delete
```

### 6.2 Por qué no un rol predefinido

| Rol | Veredicto |
|---|---|
| **Owner**, **Editor** | Descartados sin discusión: son control total del proyecto |
| **`roles/firebaseauth.admin`** | **Descartado.** Trae once permisos, siete de ellos innecesarios: `configs.create`, `configs.get`, `configs.getHashConfig`, `configs.getSecret`, `configs.update`, `users.create` y `users.sendEmail`. Los tres graves son `configs.getSecret` (leer los secretos de cliente), `configs.getHashConfig` (**exportar el hash de la contraseña de todos los clientes**) y `configs.update` (cambiar los proveedores de acceso). Un despliegue comprometido no debe poder hacer ninguna de las tres |
| **`roles/firebaseauth.viewer`** | Descartado por corto: solo `configs.get` y `users.get`. No permite crear la cookie de sesión, ni revocar, ni borrar |

`firebaseauth.users.create` y `firebaseauth.users.sendEmail` **no hacen falta**: las altas y
los correos de verificación los hace el SDK web desde el navegador del cliente, con la clave
pública, sin pasar por el servidor.

### 6.3 Un cabo que la implementación tiene que resolver

Los roles predefinidos de Firebase incluyen además `firebase.projects.get`,
`resourcemanager.projects.get` y algún permiso de clientes. **Sin comprobar** si
`firebase-admin` los necesita cuando el `projectId` se le pasa explícito, que es nuestro
caso. La implementación empieza con los cuatro permisos y solo añade otro si una llamada
real falla y el mensaje de error lo pide; nunca «por si acaso».

---

## 7. Variables de entorno

En Vercel, **ámbito Preview únicamente**:

| Variable | Ejemplo | Qué es |
|---|---|---|
| `GCP_PROJECT_NUMBER` | `123456789012` | Número del proyecto de Google |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel` | El pool |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel` | El proveedor |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `econoluz-identidad-preview@…` | La cuenta a suplantar |
| `GCP_AUDIENCE` | `https://iam.googleapis.com/projects/…/providers/vercel` | La audiencia del proveedor |
| `FIREBASE_PROJECT_ID` | `econoluz-dev-d30ab` | El proyecto de Firebase |

**Ninguna de las seis es secreta.** Son identificadores públicos y no autorizan a nadie por
sí solas: sin un testigo OIDC firmado por Vercel para ese equipo, ese proyecto y ese
entorno, quien las tenga no obtiene absolutamente nada.

Siguen sin existir `FIREBASE_PRIVATE_KEY` y `FIREBASE_CLIENT_EMAIL`, y
`tests/identidad-frontera.test.ts` falla si alguien las reintroduce.

Además hay que revisar, **antes de cualquier despliegue**, que las variables de Preview ya
existentes apunten donde deben: `DATABASE_URL` a la rama `identidad-clientes-dev` de Neon y
no a la principal. Es el riesgo con peor consecuencia de todo el diseño.

---

## 8. Cambios en el código

### 8.1 `app/identidad/credencialFederada.server.ts` — nuevo

Construye el `ExternalAccountClient` de `google-auth-library` y lo adapta a la interfaz
`Credential` de `firebase-admin`, que resulta ser de un solo método:

```ts
export interface Credential {
  getAccessToken(): Promise<{ access_token: string; expires_in: number }>;
}
```

El cliente externo se configura con `subject_token_supplier`, cuyo `getSubjectToken` llama
a `getVercelOidcToken({ audience })`. Es el patrón que Vercel documenta para GCP.

**Único archivo del proyecto autorizado a importar `google-auth-library` y
`@vercel/oidc`**, igual que `firebase.server.ts` es el único que importa `firebase-admin` y
`app/lib/datos` el único que importa el controlador de Neon.

Dos avisos que la implementación tiene que respetar:

- **`getVercelOidcToken()` no se puede llamar en el nivel de módulo** dentro de una función
  de Vercel: el testigo vive en la cabecera de la petición. El cliente se puede construir
  una vez, pero la obtención del testigo tiene que ocurrir dentro de una petición.
- Por lo mismo, **trabajo diferido fuera del contexto de una petición fallaría** si le toca
  renovar el testigo. Hoy no hay ninguno en este camino; queda anotado.

**Una trampa concreta con la audiencia.** Los dos ejemplos de la documentación de Vercel no
escriben igual el campo `audience` del `ExternalAccountClient`: el primero usa
`//iam.googleapis.com/projects/…` y el segundo, el de audiencia personalizada,
`https://iam.googleapis.com/projects/…`. Lo que se pasa a `getVercelOidcToken({ audience })`
sí lleva `https://` en los dos. **Sin comprobar** cuál acepta el STS en cada posición; la
implementación empieza copiando literalmente el segundo ejemplo, que es el que corresponde a
nuestra decisión de 4.2, y si el canje falla prueba la otra forma antes de buscar el fallo en
ningún otro sitio. Es el tipo de detalle que cuesta una tarde si no está avisado.

### 8.2 `app/identidad/firebase.server.ts` — modificado

`obtenerCredencial()` pasa a elegir:

- **En Vercel** (`process.env.VERCEL`): exige las variables de la sección 7 y usa la
  credencial federada. Si falta cualquiera, **lanza un error claro**. No hay salida hacia
  `applicationDefault()`.
- **Fuera de Vercel:** `applicationDefault()`, exactamente como hoy.

El resto del archivo no cambia. La inicialización sigue siendo perezosa, así que un fallo de
credenciales no impide que arranque el sitio ni afecta al catálogo.

### 8.3 `tests/identidad-frontera.test.ts` — ampliado

Se mantienen las pruebas actuales y se añaden:

- Solo `credencialFederada.server.ts` importa `google-auth-library` o `@vercel/oidc` dentro
  de `app/**`.
- Con `VERCEL` puesto y sin las variables de federación, `obtenerCredencial()` **lanza**, no
  cae hacia ADC.
- Al final del trabajo: **no existe ninguna ruta de diagnóstico** en el repositorio.

### 8.4 `scripts/comprobar-federacion.mjs` — nuevo, y `npm run identidad:federacion`

Hace el canje contra el STS y una llamada real a Firebase Authentication. **No imprime el
testigo OIDC, ni el federado, ni el de acceso**: solo si sirven, cuántos segundos de vida le
quedan al de Google y qué cuenta de servicio se ha suplantado. Se añade a la lista de
excepciones declaradas de `tests/identidad-frontera.test.ts`.

### 8.5 Ruta de diagnóstico — temporal, y su retirada es obligatoria

`app/api/identidad/diagnostico/route.ts` devuelve el `projectId`, los segundos de vida del
testigo de acceso y el correo de la cuenta suplantada. No devuelve ningún testigo ni dato de
ningún cliente.

**Existe solo para la prueba en Preview y se retira antes de cualquier fusión.** La retirada
es una tarea propia del plan, con su commit, y ese mismo commit añade la prueba estructural
de 8.3 que impide que vuelva a aparecer sin que nadie se entere.

### 8.6 Dependencias

Dos nuevas **como dependencias directas**, ambas oficiales y ambas ya presentes de forma
transitiva en el árbol actual:

| Paquete | Hoy llega por | Por qué directa |
|---|---|---|
| `google-auth-library` | `firebase-admin` 14.3.0 | Se importa `ExternalAccountClient` explícitamente; depender de la transitiva se rompería en cuanto `firebase-admin` cambiara |
| `@vercel/oidc` | `@vercel/blob` 2.8.0 | Igual, con `getVercelOidcToken` |

La regla del proyecto pide justificar toda dependencia nueva. La justificación es que son
las bibliotecas oficiales de Google y de Vercel para exactamente esto, y que la alternativa
—leer la cabecera y hablar con el STS a mano— sería reimplementar mal algo ya resuelto.

---

## 9. Separación entre Preview y Production

| | Preview | Production |
|---|---|---|
| Proyecto de Firebase | `econoluz-dev-d30ab` | sin crear, **tarea aparte** |
| Cuenta de servicio | `econoluz-identidad-preview@…` | propia, en su proyecto |
| Condición de atributos | `assertion.environment == "preview"` | `== "production"`, en su proveedor |
| Variables | ámbito Preview | ámbito Production |

La separación **no** es una convención de nombres: es una condición que el STS de Google
comprueba y aplica. Un despliegue de Production no puede usar la identidad de Preview aunque
tenga sus variables, porque su testigo trae `environment: production` y la condición lo
rechaza.

Mientras Production no tenga su configuración, `/cuenta` **no funcionará en producción**, y
fallará de forma explícita por lo dicho en 8.2. Es exactamente el comportamiento que se
quiere: la web sigue en pie, el catálogo y la asesoría funcionan, y la parte de clientes
dice que no está configurada en vez de fingir que sí.

---

## 10. Pruebas

Cada prueba está pensada para verse **pasar y fallar por el motivo correcto**, no solo pasar.

### 10.1 Local sigue usando ADC

`npm run identidad:adc` sigue pasando sin cambios, y una prueba estructural comprueba que
fuera de Vercel el camino elegido es `applicationDefault()`.

### 10.2 Google acepta el testigo de Vercel y Firebase la credencial temporal

Con la condición de atributos **ampliada temporalmente**, sustituyendo la comparación de
entorno por
`(assertion.environment == "preview" || assertion.environment == "development")`:

1. `vercel link`
2. `vercel env pull .env.vercel.local` — **nunca sobre `.env.local`**, que se sobrescribiría
   y se perderían `DATABASE_URL`, `ADMIN_SESSION_SECRET` y `AUTH_EVENT_IP_PEPPER`
3. `npm run identidad:federacion`

Debe dar: canje correcto, cuenta suplantada la esperada y Firebase Authentication aceptando
la credencial.

### 10.3 Un entorno no autorizado es rechazado

Se estrecha la condición a `assertion.environment == "preview"` y **se repite 10.2 sin tocar
nada más**. Ahora el STS debe rechazar el testigo de `development`.

Esto es una prueba negativa real, ejecutada, no un razonamiento sobre lo que debería pasar.
La ventana en la que la condición está más abierta de lo definitivo dura minutos y ocurre
sobre el proyecto de desarrollo.

### 10.4 Dentro de una función de Vercel el testigo llega por la cabecera

`vercel deploy` crea un despliegue **Preview sin hacer push ni tocar GitHub ni `main`**. Se
consulta la ruta de diagnóstico y debe devolver el proyecto, la cuenta de servicio esperada
y unos segundos de vida positivos.

Esta prueba es la que no se puede sustituir por ninguna otra: es el tramo donde falla la
gente, porque el testigo no está en una variable de entorno sino en una cabecera por
petición.

De paso, **los segundos de vida que devuelve son la medida real** de cuánto dura el testigo
de acceso de Google. Se anota el valor observado en lugar de afirmar una cifra de memoria.

### 10.5 Firebase Authentication acepta las credenciales temporales

La misma ruta hace una llamada real de solo lectura contra Firebase Authentication. Que
devuelva un testigo no demuestra que tenga permiso; esto sí.

### 10.6 No hay ruta de respaldo por claves privadas

Las pruebas estructurales de 8.3, más la de que con `VERCEL` puesto y sin variables se lanza
un error en vez de caer hacia ADC.

### 10.7 La batería completa sigue verde

`test:datos`, `test:admin`, `test:proveedores`, Playwright, `typecheck`, `lint` y `build`.

---

## 11. Despliegue y rollback

### 11.1 Orden de despliegue

1. Comprobaciones previas de la sección 13 (las tres primeras filas). **Si alguna falla, se
   para aquí.**
2. Crear los seis recursos en Google Cloud, con la condición ampliada de 10.2.
3. Poner el modo de emisor en Team en Vercel.
4. Pruebas 10.2 y 10.3, en ese orden. Estrechar la condición.
5. Añadir las variables de la sección 7 al ámbito Preview y **revisar `DATABASE_URL` de
   Preview**.
6. `vercel deploy` y pruebas 10.4 y 10.5.
7. Retirar la ruta de diagnóstico y añadir su prueba guardiana.
8. Batería completa.

**Nada de esto toca producción**, ni Neon de producción, ni `main`, ni GitHub.

### 11.2 Rollback

| Qué falla | Cómo se deshace |
|---|---|
| El código nuevo | `git revert` en la rama. El worktree y la rama se conservan |
| El despliegue Preview | Se borra desde el panel de Vercel |
| Los recursos de Google | Se borran el pool, la cuenta de servicio y el rol personalizado. No dejan rastro en otros proyectos |
| Solo el acceso, con urgencia | Quitar el enlace `roles/iam.workloadIdentityUser` de la cuenta, o deshabilitar la cuenta de servicio. Ver la ventana residual en 12.2 |

El rollback **no depende de ninguna variable de entorno**: son operaciones en el panel de
Google o de Vercel, que surten efecto aunque el despliegue siga en pie.

---

## 12. Rotación, revocación, auditoría y recuperación

### 12.1 Rotación

**No hay nada que rotar.** No existe ninguna credencial de larga duración. Vercel gestiona
sus claves de firma y las publica en su punto `.well-known`; Google las descubre solo. El día
que Vercel rote sus claves, no hay que hacer nada.

### 12.2 Revocación, y su ventana residual

Quitar el enlace `roles/iam.workloadIdentityUser` corta **los canjes nuevos de inmediato**.
Pero un testigo de acceso ya emitido sigue siendo válido hasta que caduque.

**Esa es la ventana residual, y es corta pero no cero.** Es el precio de no tener claves
permanentes, y es incomparablemente mejor que el de una clave filtrada, que vale hasta que
alguien se acuerda de revocarla. Si hiciera falta cortar de verdad y ya, la vía es
deshabilitar la cuenta de servicio.

### 12.3 Auditoría

Las llamadas al Security Token Service y a la API de credenciales de cuenta de servicio
quedan registradas del lado de Google. **Sin comprobar** qué tipo exacto de registro de
auditoría las recoge y si alguno requiere habilitar los registros de acceso a datos; la
implementación lo comprueba mirando los registros reales después de la prueba 10.4, y lo
anota aquí.

### 12.4 Recuperación

Si la federación se rompe, **el resto del sitio no se entera**. La inicialización de
`firebase-admin` es perezosa: el catálogo, la asesoría, los proyectos y el panel siguen
funcionando; solo `/cuenta` falla, y falla diciendo qué pasa.

---

## 13. Riesgos

| Riesgo | Gravedad | Respuesta |
|---|---|---|
| La organización tiene activa `constraints/iam.workloadIdentityPoolProviders` y no admite `oidc.vercel.com` | **Bloqueante** | Se comprueba **antes de crear nada**. No se desactiva: se va a la alternativa 14.2 |
| La cuenta del dueño no puede crear pools, cuentas de servicio o roles personalizados | **Bloqueante** | Se comprueba antes. Lo concede quien administre la organización |
| Vercel no tiene disponible *Secure backend access with OIDC federation* | **Bloqueante** | Se comprueba antes en Settings → Security |
| **`DATABASE_URL` de Preview apunta a la Neon principal** | **Alta** | Se revisa antes del paso 6 de 11.1. Es el riesgo con peor consecuencia del diseño |
| El despliegue Preview queda accesible en internet | Media | Depende del plan y de Deployment Protection. Se mira antes de desplegar. La ruta de diagnóstico no expone datos de clientes, pero `/cuenta` sí funcionaría |
| Renombrar el equipo o el proyecto en Vercel rompe el enlace del principal | Media | Falla de forma ruidosa, no silenciosa. La condición usa identificadores estables; el enlace, nombres. Queda documentado para el día que ocurra |
| Trabajo diferido fuera del contexto de una petición no encuentra el testigo | Baja | Hoy no existe en este camino. Anotado en 8.1 para que no se introduzca sin darse cuenta |
| Ventana de revocación de un testigo ya emitido | Baja | Explicada sin adornos en 12.2 |

---

## 14. Alternativas

### 14.1 Si Vercel OIDC no encajara con Firebase Admin

**Encaja, y está demostrado.** `firebase-admin` 13.0.0, del 12/11/2024, anunció: *«Migrated
credentials handling to use google-auth-library. The SDK now supports new authentication
methods including Workload Identity Federation and service account impersonation»*. Se ha
confirmado además en el código de la 14.3.0 instalado en este worktree:
`lib/app/credential-internal.js` construye un `GoogleAuth` de `google-auth-library` 10.9.1,
y la interfaz `Credential` que hay que satisfacer es de un solo método.

No es una suposición que haya que verificar más adelante: la pregunta está cerrada.

### 14.2 Si la política de la organización bloqueara el proveedor

La alternativa **no** es pedir una excepción para generar una clave. Sería mover únicamente
las rutas que hablan con Firebase a infraestructura de Google —Cloud Run o Firebase App
Hosting, donde hay credenciales predeterminadas de serie— y dejar el resto del sitio en
Vercel.

Es bastante más trabajo, añade un servicio que mantener y parte el despliegue en dos. Por eso
es plan B.

### 14.3 Descartadas

- **Archivo de configuración `external_account` con `GOOGLE_APPLICATION_CREDENTIALS`.** Sería
  el camino sin tocar código, porque `applicationDefault()` ya lo admite. Pero en Vercel el
  sistema de archivos es de solo lectura salvo `/tmp`, y el testigo no está en un archivo
  sino en una cabecera por petición: habría que escribirlo en disco en cada petición, con
  condiciones de carrera entre invocaciones concurrentes de la misma instancia. Frágil sin
  ganar nada.
- **Verificar los testigos con `jose` y hablar con Identity Toolkit por REST.** Reduciría la
  superficie, pero `tests/identidad-frontera.test.ts` lo prohíbe expresamente y la norma del
  proyecto prefiere la biblioteca oficial mientras no haya un problema demostrado con ella.
- **Pedir una excepción a la política de claves.** No se propone.

---

## 15. Costes, límites y fuentes

### 15.1 Costes

- **Google Cloud:** no hay precio publicado para Workload Identity Federation ni para el
  Security Token Service. Lo que hay son cuotas, no facturación.
- **Vercel:** la federación OIDC es parte de la plataforma y no aparece como partida
  facturable. Lo que hay que confirmar es que el permiso esté disponible en el equipo.
- **Firebase Authentication:** esta tarea no cambia nada de lo que se paga o no se paga.
- **Plan gratuito:** el límite que puede aparecer no es de dinero sino de plan de Vercel, en
  la protección de los despliegues Preview. Se mira antes del paso 6 de 11.1.

### 15.2 Cuotas relevantes

| Cuota | Límite | Nuestro uso |
|---|---|---|
| Canjes de testigo en el STS | 6.000 por minuto y proyecto | Uno cada 90 minutos por instancia |
| `generateAccessToken` | 60.000 por minuto y proyecto | Igual |
| Lectura de la API de WIF | 600 por minuto y proyecto | No se usa en caliente |

Estamos varios órdenes de magnitud por debajo, y lo estaríamos aunque el sitio creciera
mucho, porque el testigo se cachea por instancia y no se pide por petición.

### 15.3 Fuentes, consultadas el 01/09/2026

**Vercel**

- [OpenID Connect (OIDC) Federation](https://vercel.com/docs/oidc) — modos de emisor,
  cabecera `x-vercel-oidc-token`, reutilización de hasta 90 minutos y TTL de dos horas en
  funciones, `vercel env pull`.
- [OIDC Federation Reference](https://vercel.com/docs/oidc/reference) — afirmaciones del
  testigo, formato de `sub`, duraciones por entorno (build una hora; preview y production dos
  horas; development doce horas), aviso de que renombrar cambia las afirmaciones, aviso de no
  llamar a `getVercelOidcToken()` en el nivel de módulo.
- [Connect to Google Cloud Platform (GCP)](https://vercel.com/docs/oidc/gcp) — pasos de
  creación del pool y el proveedor, audiencia predeterminada frente a audiencias permitidas,
  y el ejemplo con `ExternalAccountClient` y `subject_token_supplier`.

**Google Cloud**

- [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
  — acceso directo frente a suplantación, formatos `principal://` y `principalSet://`.
- [Configure WIF with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
  — comandos, mapeo de atributos, condiciones CEL, `roles/iam.workloadIdentityUser`.
- [Best practices for using WIF](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)
  — audiencia del proveedor y ataque de delegado confuso, cuenta de servicio dedicada por
  aplicación, no conceder acceso a todo el pool.
- [Troubleshoot WIF](https://docs.cloud.google.com/iam/docs/troubleshooting-workload-identity-federation)
  — límite de 127 bytes de `google.subject`.
- [Manage workload identity pools and providers](https://docs.cloud.google.com/iam/docs/manage-workload-identity-pools-providers)
  — `constraints/iam.workloadIdentityPoolProviders`, y que solo limita la creación y
  actualización de proveedores, no el uso de los ya creados.
- [Cuotas de IAM](https://docs.cloud.google.com/iam/quotas) — las cifras de 15.2.

**Firebase**

- [Firebase IAM permissions](https://firebase.google.com/docs/projects/iam/permissions) — los
  once permisos `firebaseauth.*` y qué hace cada uno, incluido
  `firebaseauth.users.createSession`.
- [Roles predefinidos por producto](https://firebase.google.com/docs/projects/iam/roles-predefined-product)
  — contenido exacto de `roles/firebaseauth.admin` y `roles/firebaseauth.viewer`.
- [Notas de versión del Admin SDK de Node](https://firebase.google.com/support/release-notes/admin/node)
  — la 13.0.0 y el soporte de Workload Identity Federation.

**Código instalado en este worktree**, usado como fuente primaria sobre qué admite cada
biblioteca:

- `node_modules/firebase-admin/lib/app/credential-internal.js` y `credential.d.ts`
- `node_modules/google-auth-library/build/src/auth/externalclient.d.ts` y
  `baseexternalclient.d.ts`
- `node_modules/@vercel/oidc/dist/get-vercel-oidc-token-sync.js`

---

## 16. Lo que quedaba sin comprobar — resuelto el 01/09/2026

Cuatro de los cinco puntos están cerrados **con una ejecución real**, no con un
razonamiento. El único que sigue abierto está marcado como tal.

1. **¿`firebase-admin` necesita algún permiso de proyecto además de los cuatro de 6.1?**
   **No.** Con el rol personalizado de cuatro permisos y ningún otro, Firebase
   Authentication aceptó la credencial y respondió a una llamada real de lectura. No hizo
   falta añadir `firebase.projects.get` ni `resourcemanager.projects.get`.

2. **¿Qué registro de auditoría recoge los canjes del STS?** **Sigue sin comprobar.** Se
   mirará junto a la prueba en Preview.

3. **¿Cuánto dura el testigo de acceso de Google?** **3.563 segundos** en la primera
   medición, es decir la hora estándar menos el tiempo de ida y vuelta. Esa es la ventana
   residual de revocación de la sección 12.2, ahora medida y no supuesta.

4. **¿La organización admite `oidc.vercel.com`? ¿Vercel ofrece la federación?** **Sí a las
   dos.** `constraints/iam.workloadIdentityPoolProviders` está en `allValues: ALLOW`, así
   que no hubo que tocar ninguna política; y el equipo `joseangel-s-projects` tiene la
   sección con el modo de emisor ya en *Team*.

5. **¿Qué forma del campo `audience` acepta el STS?** **El nombre de recurso, sin
   esquema.** La documentación de Vercel se contradice entre sus dos ejemplos y el STS
   zanjó la duda rechazando el canje:

   > `Error code invalid_request: Invalid value for "audience". This value should be the
   > full resource name of the Identity Provider.`

   Al **testigo** se le pide la audiencia con `https://`, que es la que publica el
   proveedor y acaba en la afirmación `aud`. Al **STS** se le pasa
   `//iam.googleapis.com/projects/…`. `app/identidad/credencial.ts` normaliza las dos
   formas y lo cubren tres pruebas de unidad.

---

## 17. Evidencia de las pruebas — 01/09/2026

### 17.1 Recursos creados en `econoluz-dev-d30ab`

| Recurso | Valor real |
|---|---|
| Número del proyecto | `629521051305` |
| Pool | `vercel`, `ACTIVE` |
| Proveedor | `vercel`, `ACTIVE`, emisor `https://oidc.vercel.com/joseangel-s-projects`, **sin** `allowedAudiences` |
| Rol | `econoluzIdentidadServidor`, cuatro permisos y ninguno más |
| Cuenta | `econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com`, **un solo rol** |
| Equipo de Vercel | `joseangel-s-projects` — `team_Dsl9K7DahJEa1bYTq3aQaoQ4` |
| Proyecto de Vercel | `econoluz-gt` — `prj_RQAemyVYK4hWVhTOuFG32WvyYoG8` |

Condición de atributos vigente:

```
assertion.owner_id == 'team_Dsl9K7DahJEa1bYTq3aQaoQ4' &&
assertion.project_id == 'prj_RQAemyVYK4hWVhTOuFG32WvyYoG8' &&
assertion.environment == 'preview'
```

Quien puede suplantar la cuenta, tras retirar el enlace temporal:

```
principal://iam.googleapis.com/projects/629521051305/locations/global/
  workloadIdentityPools/vercel/subject/
  owner:joseangel-s-projects:project:econoluz-gt:environment:preview
```

### 17.2 Prueba positiva (10.2)

Con la condición ampliada temporalmente a `preview` y `development`:

```
  ok     hay testigo OIDC de Vercel (entorno: development)
  ok     Google acepta la identidad federada (la credencial vale 3563 s)
  ok     Firebase Authentication acepta la credencial temporal
```

### 17.3 Prueba negativa (10.3) — la que convierte esto en demostrado

Se estrechó la condición a `preview` y **se repitió el mismo comando sin cambiar nada
más**. El testigo seguía existiendo; el canje pasó a rechazarse:

```
  ok     hay testigo OIDC de Vercel (entorno: development)
  FALLA  Google rechaza la identidad federada.
  Motivo: Error code unauthorized_client: The given credential is rejected by
          the attribute condition.
```

El mensaje atribuye el rechazo **a la condición de atributos**, no a otra cosa: eso es lo
que prueba que la separación por entorno funciona de verdad.

Después se retiró también el enlace `roles/iam.workloadIdentityUser` de
`environment:development` y se repitió una tercera vez, con el mismo rechazo y los dos
cierres puestos.

### 17.4 Afirmaciones reales del testigo de Vercel

Coinciden exactamente con el formato documentado, y confirman las duraciones de 3.1:

| Afirmación | Valor |
|---|---|
| `iss` | `https://oidc.vercel.com/joseangel-s-projects` |
| `aud` | `https://vercel.com/joseangel-s-projects` |
| `sub` | `owner:joseangel-s-projects:project:econoluz-gt:environment:development` |
| `environment` | `development` |
| Vida | **12 horas**, la documentada para `development` |
