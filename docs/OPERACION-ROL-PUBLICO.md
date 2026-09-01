# Operación del rol público de PostgreSQL

`econoluz_publico` es la identidad que usará el camino de lectura del catálogo. Su única
capacidad de negocio es ejecutar `SELECT` sobre `public.public_products`. No puede leer
`products`, datos administrativos, solicitudes, proyectos ni migraciones, y tampoco
recibe permisos sobre tablas futuras por defecto.

La contraseña y las cadenas de conexión son secretos. No se pegan en incidencias, chats,
commits, capturas ni salidas de terminal.

## 1. Crear o activar el rol

1. Seleccionar en Neon la rama del entorno correcto. Para desarrollo de este subproyecto
   es exclusivamente `fundamentos-backend-dev`; comprobarlo de nuevo antes de ejecutar
   SQL.
2. Con la conexión administrativa de esa rama, ejecutar `npm run db:migrar`. La migración
   `db/006_rol_publico.sql` crea `econoluz_publico` como `NOLOGIN`, revoca sus permisos y
   concede solo `USAGE` sobre el esquema `public` y `SELECT` sobre `public_products`.
3. Generar la contraseña como se explica en el apartado siguiente.
4. En el editor SQL de Neon, todavía sobre la misma rama, activar el acceso:

   ```sql
   alter role econoluz_publico login password '<CONTRASEÑA_GENERADA>';
   ```

Crear este rol mediante SQL es deliberado: no debe recibir el rol administrativo
`neon_superuser`. No se debe crear como propietario, superusuario ni miembro de otro rol.
La migración tampoco lleva contraseña para que pueda versionarse sin exponer secretos.

## 2. Generar y rotar la contraseña

Generar una contraseña aleatoria fuera del repositorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copiar el resultado directamente al gestor de secretos correspondiente. No guardarlo en
un archivo versionado. Los 32 bytes aleatorios superan el mínimo de entropía exigido por
Neon y el formato `base64url` evita tener que escapar caracteres al construir la URL.

Rotar la contraseña cada 90 días y de inmediato si pudo quedar expuesta, alguien con
acceso deja el proyecto o cambia el alcance de los permisos. En desarrollo o pruebas,
donde un reinicio breve es aceptable:

1. Generar una contraseña nueva.
2. Ejecutar en la rama correcta:

   ```sql
   alter role econoluz_publico password '<CONTRASEÑA_NUEVA>';
   ```

3. Sustituir `DATABASE_URL_PUBLIC` en el secreto del entorno.
4. Reiniciar los procesos que mantengan conexiones, ejecutar `npm run test:permisos` y
   retirar la contraseña anterior del gestor de secretos.

Una sola identidad y una sola contraseña no permiten garantizar una rotación sin corte.
Para producción se usa temporalmente una segunda identidad de lectura, creada por SQL y
nunca desde el panel de roles de Neon:

1. Crear `econoluz_publico_rotacion` con `LOGIN`, contraseña aleatoria y exactamente los
   mismos `REVOKE` y `GRANT` de `db/006_rol_publico.sql`.
2. Comprobar con esa cadena que `current_user` es `econoluz_publico_rotacion`, que
   `public_products` es legible y que cada tabla protegida devuelve `42501` o no existe.
3. Guardar la cadena temporal como `DATABASE_URL_PUBLIC`, crear y verificar un despliegue
   nuevo y dirigir producción a él. El despliegue anterior mantiene su contraseña válida
   durante el cambio.
4. Rotar la contraseña de `econoluz_publico`, actualizar el secreto, crear y verificar un
   segundo despliegue y dirigir producción de nuevo al rol permanente.
5. Revocar `LOGIN`, cerrar conexiones y eliminar el rol temporal cuando ya no haya tráfico
   en el despliegue anterior. La retirada de ese rol requiere una ventana de observación;
   no se hace mientras pueda atender peticiones.

Este procedimiento no autoriza un despliegue: cada despliegue y cada cambio en producción
requieren la aprobación correspondiente.

## 3. Obtener `DATABASE_URL_PUBLIC`

Partir de la cadena directa del entorno correcto y conservar exactamente su host, base de
datos y parámetros. Sustituir únicamente el usuario y la contraseña:

```text
postgresql://econoluz_publico:<CONTRASEÑA>@<HOST-DE-LA-RAMA>/<BASE-DE-DATOS>?sslmode=require
```

No reutilizar `DATABASE_URL`: esa cadena pertenece al camino administrativo. Tampoco
copiar una URL entre ramas. En desarrollo, el host de `DATABASE_URL_PUBLIC` debe coincidir
con el de `DATABASE_URL` del mismo worktree y ser el endpoint de
`fundamentos-backend-dev`.

## 4. Configurar los entornos

| Entorno | Rama de Neon | Dónde guardar `DATABASE_URL_PUBLIC` | Regla |
|---|---|---|---|
| Desarrollo | Rama personal aislada | `.env.local`, que está ignorado por Git | Se admite la conexión administrativa solo para migrar; la prueba usa la pública. |
| Pruebas | Rama efímera o dedicada | Secreto del ejecutor de CI | Deben existir `DATABASE_URL` y `DATABASE_URL_PUBLIC`; no hay degradación. |
| Staging | Rama dedicada de staging | Secreto del entorno Preview de Vercel | No reutilizar la rama ni la credencial de producción. |
| Producción | Rama de producción | Secreto del entorno Production de Vercel | Nunca usar `DATABASE_URL` como sustituto; configurar solo con autorización de despliegue. |

**Qué pasa si la cadena falta.** No es una pregunta abierta: la regla vive en
`app/data/origenPublico.ts` y la fijan las doce pruebas de
`tests/datos-respaldo-configuracion.test.ts`. En producción se sirve el catálogo escrito
en el código y se registra `catalogo-publico-sin-cadena-publica`, **y la conexión
privilegiada no llega a invocarse**; en desarrollo local sí se usa, dejando el aviso
`catalogo-publico-con-conexion-privilegiada`, para no exigir credenciales del rol público
solo para arrancar el sitio. Dos de esas pruebas vigilan que `ejecutorPublico` y
`leerPublico` no puedan degradar a la conexión privilegiada, y se comprobó que fallan
cuando esa protección se rompe a propósito.

Aplicar las migraciones con la conexión administrativa de cada rama y activar allí el
rol. Las credenciales de una rama no se dan por válidas en otra. Limitar el secreto de
Vercel al entorno correspondiente y provocar un despliegue nuevo después de cambiarlo.

## 5. Verificar la identidad y los permisos

Antes de usar una cadena nueva, comprobar sin imprimirla que apunta al mismo host aislado
que la conexión administrativa del entorno. Después ejecutar:

```bash
npm run test:permisos
```

La prueba exige, en este orden:

1. que `current_user` sea exactamente `econoluz_publico`;
2. que cada tabla protegida deniegue la lectura o todavía no exista;
3. que `public_products` sea legible;
4. que no haya tablas o vistas públicas sin clasificar.

Desde la tarea 9 **las diez tablas protegidas existen todas** —`app_settings` y
`audit_log` incluidas— y las diez deniegan la lectura: ya no queda ninguna que pase la
comprobación por no existir todavía. El cuarto punto también está probado de verdad: se
creó una vista sin clasificar en la rama de desarrollo, la prueba falló nombrándola y
terminó con código 1, y al retirarla volvió a pasar.

Un resultado correcto termina con `Todo correcto.` y código cero. Una cadena del
propietario falla en el primer punto. Repetir la prueba después de cada migración, cambio
de permisos o rotación y antes de promover un entorno. Nunca diagnosticar un fallo
imprimiendo la URL o la contraseña.
