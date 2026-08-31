# Especificación: subproyecto 1 — Fundamentos del backend y capa de acceso a datos

**Fecha:** 30/08/2026
**Diseño global del que depende:** `docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md`
**Estado:** aprobado por el dueño con correcciones incorporadas; pendiente de su revisión
completa. **No autoriza escribir código ni ejecutar migraciones.**

---

## 1. Objetivo

Cambiar los cimientos sin que cambie nada visible.

Al terminar, el sitio hace exactamente lo mismo que hoy, con exactamente los mismos 313
productos, y todas las pruebas actuales siguen en verde. **Esa invisibilidad es el
criterio de éxito, no un efecto secundario**: es lo que permite tocar la base de todo el
sistema sin arriesgar la tienda.

### Por qué va primero

Hoy hay **once archivos que abren su propia conexión a Neon**. Cada subproyecto posterior
añade más. Si esto se deja para el final, los once serán treinta y unificarlos pasará de
ser un trabajo de semanas a uno de meses sobre una tienda ya en marcha. Es la única pieza
que se abarata haciéndola primero.

Además, **sin transacciones en la aplicación no se puede crear un pedido de forma
atómica**. Conviene precisar qué es lo atómico y qué no, porque es fácil prometer de más:
dentro de una transacción de Neon pueden ir el pedido, sus líneas, sus direcciones, su
registro de estado, el **registro local del intento de pago** y la clave de idempotencia.
**El cobro en sí no puede**: lo ejecuta una pasarela externa y no forma parte de ninguna
transacción de base de datos. El resultado real del cobro lo confirma después el webhook
firmado de la pasarela.

Y dos motivos más: la regla de centavos enteros y la del aislamiento del proveedor pasan
de convenciones a restricciones que el sistema impone; y la estrategia de ramas de Neon
que todos los demás subproyectos necesitan nace aquí.

> **Lo que no falta:** el migrador. `scripts/migrate.mjs` **ya es transaccional**,
> comprobado el 30/08/2026. Ver la sección 2.2.

---

## 2. Alcance

### 2.1 La capa de acceso, en `app/lib/datos/`

| Módulo | Responsabilidad |
|---|---|
| `conexion.ts` | Las dos conexiones (lectura por HTTP, escritura por pool) y las dos cadenas (aplicación y rol público), creadas de forma perezosa para que la falta de credenciales en local no rompa la importación del módulo |
| `consulta.ts` | Consultar con parámetros, tiempo máximo y tipado del resultado |
| `transaccion.ts` | `enTransaccion(fn)` con `BEGIN`, `COMMIT`, `ROLLBACK` ante error y liberación del cliente en `finally` |
| `errores.ts` | Errores tipados: `NoEncontrado`, `Conflicto`, `PermisoDenegado`, `Indisponible` |
| `registro.ts` | Registro estructurado con `request_id`, sin datos personales ni secretos |

**Regla estructural, con su alcance exacto:** **dentro de `app/**`**, ningún archivo fuera
de `app/lib/datos/` importa `@neondatabase/serverless`, y **una prueba lo comprueba y
falla si alguien lo hace**. Sin esa prueba, en tres meses habrá un archivo número doce.

**`scripts/**` queda excluido de la comprobación, y tiene que estarlo.**
`scripts/migrate.mjs` se conecta por sí mismo porque crea el esquema del que depende la
capa: se ejecuta fuera de la aplicación y no puede darlo por existente. Lo mismo vale para
los scripts de importación y verificación. Los scripts mantienen su propia frontera —un
ayudante común en `scripts/` cuando compartan conexión—, en lugar de dejar una regla que
el propio migrador incumpliría desde el primer día.

**Requisitos de las transacciones interactivas:**

- La ruta o acción declara `export const runtime = "nodejs"`.
- Se usa la conexión agrupada sobre WebSocket, no el controlador HTTP, porque el
  controlador HTTP no puede leer, decidir y escribir dentro de la misma transacción.
- `BEGIN` al abrir; `ROLLBACK` ante cualquier error; `COMMIT` al terminar bien.
- Tiempo máximo explícito.
- **El cliente se libera siempre en un `finally`.**
- **El pool se conserva entre transacciones.** No se abre ni se cierra el pool completo en
  cada una: eso desperdiciaría la reutilización de conexiones inactivas, que es
  precisamente para lo que existe.

### 2.2 Migraciones nuevas

**`005_proyeccion_publica.sql`** — la **tabla de proyección pública derivada y
sincronizada** `public_products`. No es una vista, y tampoco es una `MATERIALIZED VIEW` de
PostgreSQL: es una tabla ordinaria que la aplicación mantiene al día, **no es fuente de
verdad**, y su contenido se puede reconstruir entero a partir de `products` en cualquier
momento. Contiene el contrato público **ya saneado**: identificador
público, referencia, nombre y descripción limpios, ruta de imagen pública, galería
pública, taxonomía pública con sus etiquetas, ficha técnica filtrada a las claves
permitidas y saneada, y el precio vigente. No contiene ninguna columna `supplier_*`, ni
`stock`, ni `sellable_online`, ni columnas administrativas, ni productos sin publicar.

> **Por qué una tabla y no una vista.** Una vista que excluya las columnas del proveedor
> **no reproduce la protección actual**: la limpieza que hace hoy
> `publicProductPrivacy.ts` usa `supplierBrand`, `labels.brand`, `labels.series`,
> `series`, `supplierCode` y `name` **como contexto** para construir sus patrones. Sin
> esos campos no puede limpiar; con ellos, el rol dejaría de estar aislado. La solución es
> adelantar la limpieza de la lectura a la escritura. El razonamiento completo está en la
> sección 7.2.1 del diseño global.

**Quién la escribe:** el camino privilegiado. El panel, al guardar un producto —en el
mismo punto donde ya invalida la caché del catálogo—, y un comando de reconstrucción
completa idempotente. Ejecutando **el mismo código que hoy**, `toPublicProduct` junto a
`publicProductPrivacy`: la lógica de privacidad **no se reescribe**, solo cambia cuándo se
ejecuta.

**Su condición durante este subproyecto, decidida por el dueño el 30/08/2026:** es una
**proyección derivada de prueba**. Se construye y se prueba porque el rol público necesita
una superficie segura que leer, pero **no sustituye al catálogo que ve el visitante**.
`publicProduct.ts` y `publicProductPrivacy.ts` permanecen **activos e intactos** hasta
demostrar la paridad y la privacidad completas de los 313 productos.

Las vistas para categorías, atributos, opciones y precios vigentes llegan con el
subproyecto 3, cuando existan esas tablas. Aquí no hacen falta.

**`006_rol_publico.sql`** — define el rol, le revoca todo (`REVOKE ALL`) y le concede
`SELECT` **exclusivamente sobre la proyección pública `public_products`**. Ni una tabla
base ni ninguna fuente de verdad. Queda denegado
el acceso a `products`, `product_private_data`, `users`, `user_addresses`, `orders`,
`order_items`, `payments`, `invoices`, `leads`, `admin_users`, `admin_sessions`,
`admin_login_attempts` y `audit_log`.

> **Ninguna contraseña aparece en esta migración ni en el repositorio.** La migración
> define el rol y los permisos; las credenciales de acceso se generan y guardan fuera
> (sección 4).

**`007_app_settings.sql`** — configuración persistente y protegida: clave, valor, quién
la cambió y cuándo. Nace ya en este subproyecto porque todos los demás la necesitarán
para poder volverse atrás sin desplegar. Alberga el selector de modelo con los valores
`legacy`, `shadow` y `relational_v2`, leído con caché breve y con auditoría de cambios.

**`008_audit_log.sql`** — quién cambió qué, con el antes y el después.

**El migrador ya es transaccional, y esto no se construye: se verifica.** Comprobado el
30/08/2026 en `scripts/migrate.mjs`: aplica cada archivo dentro de `begin` / `commit`,
hace `rollback` deshaciendo el archivo entero si una instrucción falla, e inserta la fila
de `schema_migrations` **dentro de la misma transacción**. Además es repetible y nunca
imprime la cadena de conexión.

La tarea de este subproyecto es, por tanto, **verificarlo, cubrirlo con pruebas
automáticas —hoy no tiene ninguna— y reforzarlo solo si la comprobación revela un hueco
real**. Un candidato a reforzar, sujeto a que la comprobación lo confirme: un bloqueo
consultivo para que dos ejecuciones simultáneas del migrador no compitan. No se presenta
como funcionalidad nueva porque no lo es.

### 2.3 Traslado de los once puntos de acceso

Los once archivos que hoy construyen su propia conexión pasan a usar la capa, **uno por
commit y sin cambiar comportamiento**:

`app/admin/auth/repository.server.ts` · `app/admin/panelStats.server.ts` ·
`app/admin/productos/ficha.server.ts` · `app/admin/productos/list.server.ts` ·
`app/admin/productos/nuevo.server.ts` · `app/admin/proyectos/imagenes.server.ts` ·
`app/admin/proyectos/repository.server.ts` · `app/api/leads/route.ts` ·
`app/data/catalog.server.ts` · `app/data/projects.server.ts` ·
`app/tienda/disponibilidad.server.ts`

El catálogo público (`app/data/catalog.server.ts`) **no cambia de fuente en este
subproyecto**. La proyección se construye, se compara y se prueba; la bandera de
`app_settings` **se queda en `legacy`** al terminar, y `shadow` se usa únicamente para
comparar resultados y registrar diferencias sin cambiar lo que ve nadie.
**`relational_v2` no se activa aquí en ningún caso**: solo podrá activarse en el
subproyecto 3, con autorización expresa del dueño (sección 10).

Los scripts de `scripts/` **no se trasladan a la capa**: mantienen su propia frontera por
las razones de la sección 2.1.

### 2.4 Configuración

Variable nueva: **`DATABASE_URL_PUBLIC`**, la cadena del rol de lectura pública. Se añade
a `.env.example` con explicación y sin valor.

---

## 3. Comportamiento si falta `DATABASE_URL_PUBLIC`

**La conexión privilegiada nunca se usa como respaldo del camino público.** Hacerlo
convertiría un fallo de configuración en la desaparición silenciosa de la protección que
este subproyecto construye: el sitio seguiría funcionando y nadie se enteraría de que la
barrera ya no está.

| Entorno | Comportamiento |
|---|---|
| Desarrollo local | Se permite `DATABASE_URL` para el camino público, **con un aviso explícito en consola** |
| Pruebas | Deben proporcionarse las dos conexiones. No se admite degradación; la batería falla si falta una |
| Producción | **Se sirve el catálogo estático de `app/data/products.ts` como respaldo seguro** y se registra un error de configuración. **Nunca** se usa `DATABASE_URL` para la lectura pública |

Así el sitio sigue en pie ante un descuido de configuración, pero el descuido se nota y no
rebaja la seguridad.

---

## 4. Procedimiento del rol público

Se documenta aparte de las migraciones porque **no puede vivir en el repositorio**. Al
empezar la implementación, esto se convierte en un documento de operación con los pasos
exactos, y aquí queda su índice obligatorio:

1. **Creación o activación del rol con capacidad de acceso** en Neon, y qué permisos
   recibe exactamente (solo `SELECT` sobre la proyección pública `public_products`).
2. **Generación de su contraseña**, fuera del repositorio, y **procedimiento de rotación**:
   cada cuánto, cómo se rota sin cortar el servicio y qué se actualiza después.
3. **Obtención de `DATABASE_URL_PUBLIC`** a partir del rol y la contraseña.
4. **Configuración en los cuatro entornos**: desarrollo, pruebas, staging y producción,
   indicando dónde se guarda el secreto en cada uno (Neon y Vercel).
5. **Verificación de que la cadena usa realmente el rol público**, no el propietario.

El punto 5 no es una formalidad: una cadena mal copiada haría que todo pareciera
funcionar mientras la barrera no existe.

---

## 5. Pruebas

| Prueba | Qué comprueba |
|---|---|
| Frontera del controlador | Ningún archivo fuera de `app/lib/datos/` importa `@neondatabase/serverless` |
| Errores tipados | Cada situación produce su error y no uno genérico |
| Transacción correcta | Los cambios se confirman juntos |
| Transacción fallida | Nada queda escrito, y se ejecutó `ROLLBACK` |
| Gestión del pool | Ver sección 6, criterio 6 |
| Permisos de PostgreSQL | Ver más abajo |
| Migrador transaccional (verificación) | Que el comportamiento **ya existente** se sostiene: una migración defectuosa no deja rastro parcial ni se marca como aplicada |
| Paridad de la proyección | La proyección de los 313 es idéntica, campo por campo, al resultado de computar hoy `toPublicProduct` sobre el producto interno |
| Privacidad sobre la proyección | `npm run catalogo:auditar` devuelve **0 coincidencias** sobre los 408 identificadores normalizados; `npm run test:proveedores` y `tests/catalog-production-boundary.spec.ts` pasan también contra el camino nuevo |
| Sincronía de la proyección | Guardar un producto en el panel actualiza su fila; la reconstrucción total es idempotente; la comprobación detecta filas desincronizadas |
| Paridad del catálogo | Los mismos 313 productos que hoy, contra la huella congelada |
| Respaldo de configuración | Falta `DATABASE_URL_PUBLIC` en producción: se usa el catálogo estático y **no** la conexión privilegiada |

### La prueba de permisos

Se conecta con la cadena del rol público y:

1. **Comprueba primero `current_user`** y exige que sea el rol público. Sin esta
   comprobación, una cadena mal configurada podría estar conectando como propietario y la
   prueba parecería estar probando algo que no prueba.
2. Recorre la lista de tablas prohibidas **una por una** e intenta leer cada una,
   exigiendo un error de permisos en todas.
3. Comprueba que sí puede leer la proyección pública `public_products`.
4. **Falla si aparece en la base una tabla no clasificada** ni como permitida ni como
   prohibida, para que una tabla nueva no entre sin que nadie decida su acceso.

---

## 6. Criterios de aceptación

1. **Dentro de `app/**`**, ningún archivo fuera de `app/lib/datos/` importa el controlador
   de Neon, comprobado por prueba automática. `scripts/**` queda fuera del alcance de esa
   comprobación por diseño.
2. `npm run test:admin`, `npm run typecheck`, `npm run lint`, `npm run build` y la batería
   de Playwright pasan igual que antes del cambio.
3. El catálogo devuelve los mismos 313 productos, comprobado contra la huella congelada.
4. La prueba de permisos verifica `current_user`, obtiene error de permisos en **todas**
   las tablas prohibidas, lee correctamente la proyección pública y falla ante una tabla
   sin clasificar.
5. Una transacción que falla a la mitad no deja nada escrito.
6. **Gestión del pool tras una transacción fallida:**
   - se ejecutó `ROLLBACK`;
   - el cliente se liberó en el `finally`;
   - no quedan peticiones esperando;
   - todas las conexiones abiertas están inactivas y disponibles;
   - una transacción posterior se ejecuta correctamente;
   - al cerrar explícitamente el pool en la prueba, entonces sí termina con cero
     conexiones.
7. Una migración defectuosa no deja rastro parcial ni queda registrada como aplicada
   —comportamiento ya existente, ahora demostrado por prueba.
8. En producción sin `DATABASE_URL_PUBLIC`, el catálogo se sirve del respaldo estático y
   queda registrado un error de configuración; la conexión privilegiada no se usa para
   lectura pública.
9. Ninguna contraseña ni cadena de conexión aparece en el repositorio ni en los registros.
10. **Paridad de la proyección:** los 313 productos proyectados coinciden campo por campo
    con el resultado de computar hoy `toPublicProduct`.
11. **Privacidad sobre la proyección:** la auditoría devuelve 0 coincidencias y las dos
    pruebas de frontera del proveedor pasan contra el camino nuevo.
12. **La frontera de privacidad actual sigue activa y sin modificar** al terminar el
    subproyecto, y la bandera de `app_settings` queda en **`legacy`**. `relational_v2`
    **no se activa en este subproyecto en ningún caso**, ni siquiera con los criterios 10
    y 11 en verde.

---

## 7. Fuera de alcance

- Firebase, la API v1 y el catálogo relacional v2.
- Cualquier tabla de negocio: usuarios, pedidos, pagos, facturas, envíos.
- **Cualquier tabla de inventario**: no habrá bodegas, niveles ni reservas, y `stock` no
  reaparece en ninguna forma.
- **Cualquier retirada de código o de columnas.** Retirar `products.stock`,
  `app/tienda/disponibilidad.server.ts`, el aviso del carrito y `app/data/products.ts` es
  el subproyecto 11 y necesita autorización expresa del dueño.
- **Retirar o desactivar la frontera de privacidad actual.** `app/data/publicProduct.ts` y
  `app/data/publicProductPrivacy.ts` siguen intactos y activos al terminar este
  subproyecto. La proyección los **usa**, no los sustituye, y no se convierten en camino
  único mientras la paridad y la privacidad no estén demostradas sobre los 313.
- **Activar `relational_v2`.** Queda para el subproyecto 3 y necesita autorización expresa
  del dueño. Aquí la bandera se queda en `legacy`.
- **Actualizar `CLAUDE.md` y `docs/CONTINUAR-PANEL.md`.** Es una tarea documental separada
  y ya aprobada, que se hace **antes** de empezar esta implementación y no forma parte de
  ella.
- **Retirar el contenido de Quetzaltenango.** Tarea propia y separada, posterior a la
  actualización documental. **No se mezcla con este subproyecto ni comparte su rama.**
- El cambio de contenido por el cierre de la sede de Quetzaltenango, que va en su propia
  rama y es independiente de esto.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| La proyección pública podría no cubrir un caso que hoy lee la tabla base | Prueba de paridad de los 313 y lectura en paralelo antes de cambiar nada |
| Falta la cadena del rol público en producción | Respaldo estático y error registrado; nunca la conexión privilegiada (sección 3) |
| El pool sobre WebSocket es nuevo en el proyecto | Criterio de aceptación 6, dedicado íntegramente a ello |
| Trasladar once accesos puede introducir cambios de comportamiento sutiles | Un commit por archivo, batería completa entre cada uno |
| La caché por etiquetas del catálogo podría romperse | Se conserva tal cual; la prueba de paridad la ejercita |
| La proyección se desincroniza y muestra datos viejos | Se escribe en la misma operación que guarda el producto, con reconstrucción total idempotente y comprobación de filas desincronizadas |
| Mover la limpieza de privacidad de la lectura a la escritura podría cambiar la salida sin que se note | Criterios 10 y 11: paridad campo por campo de los 313 y auditoría con 0 coincidencias antes de activar nada |

---

## 9. Forma de trabajo

**Antes del primer commit de este subproyecto** debe estar hecha la tarea documental
separada: actualizar `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` distinguiendo lo que existe
hoy en producción, las decisiones futuras ya aprobadas y lo que no puede retirarse hasta
el subproyecto 11. Esa tarea no toca código.

Después, rama de git propia y rama de Neon aislada. Commits pequeños, en este orden:

1. Los cinco módulos de `app/lib/datos/`, uno o dos por commit.
2. La prueba de frontera del controlador, limitada a `app/**`.
3. Las pruebas del migrador, que verifican el comportamiento transaccional ya existente.
4. `005_proyeccion_publica.sql`, el escritor de la proyección y el comando de
   reconstrucción total.
5. Las pruebas de paridad, privacidad y sincronía sobre la proyección.
6. `006_rol_publico.sql`, con su prueba de permisos tabla por tabla y `current_user`.
7. `007_app_settings.sql` y su módulo de lectura con caché breve.
8. `008_audit_log.sql`.
9. Once commits de traslado, uno por punto de acceso.
10. Actualización de `.env.example` y del documento de operación del rol público.

**Punto de revisión con el dueño al terminar**, antes de tocar el subproyecto 2.

### Lo que necesito del dueño cuando empiece la implementación

- Crear el rol público en Neon y generar su contraseña siguiendo el procedimiento de la
  sección 4.
- Añadir `DATABASE_URL_PUBLIC` a `.env.local` y a Vercel.
- Autorizar la rama de trabajo.

Nada de esto hay que hacerlo todavía.

---

## 10. Decisiones ya resueltas

Las cuatro que quedaban abiertas fueron **aprobadas por el dueño el 30/08/2026**. Se
recogen aquí cerradas, no como preguntas.

**1. La proyección pública entra en este subproyecto.** Se construye y se prueba aquí
porque el rol público necesita una superficie segura que leer. Durante el subproyecto 1
**sigue siendo una proyección derivada de prueba y no sustituye al catálogo que ve el
visitante**; la frontera actual permanece activa e intacta hasta demostrar paridad y
privacidad completas de los 313.

**2. `relational_v2` permanece apagado al terminar este subproyecto.** La bandera se queda
en `legacy`; `shadow` se usa solo para comparar y registrar diferencias. `relational_v2`
únicamente podrá activarse en el subproyecto 3, con el catálogo relacional ya existente,
todas las pruebas en verde y **autorización expresa del dueño**.

**3. `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` se actualizan como tarea documental
separada**, después de cerrar y aprobar los dos documentos de diseño y **antes** de
empezar cualquier implementación. Debe distinguir lo que existe hoy en producción, las
decisiones futuras ya aprobadas, y lo que no puede eliminarse hasta el subproyecto 11.
**Actualizar la documentación no autoriza a retirar `stock`, borrar
`disponibilidad.server.ts`, eliminar el carrito actual ni tocar nada de Quetzaltenango.**

**4. Recuento y nomenclatura.** 33 tablas físicas nuevas: 31 de negocio y contenido,
`app_settings` de configuración y `public_products` de proyección pública derivada.
`public_products` **no es fuente de verdad** y se describe como «tabla de proyección
pública derivada y sincronizada», nunca como vista materializada, para no confundirla con
una `MATERIALIZED VIEW` de PostgreSQL.

**No queda ninguna decisión pendiente relacionada con este subproyecto.** Las que siguen
abiertas en el proyecto —pasarela de pago, certificador FEL, política de retención, textos
legales, precios y DNS— están en la sección 11 del diseño global y ninguna lo bloquea.

---

## 11. Historial

| Fecha | Cambio |
|---|---|
| 30/08/2026 | Documento inicial, con las tres correcciones del dueño ya incorporadas: nunca usar la conexión privilegiada como respaldo del camino público, criterio correcto de gestión del pool, y ninguna contraseña del rol en migraciones ni en el repositorio, con `current_user` comprobado en la prueba de permisos |
| 30/08/2026 (cierre) | Las cuatro decisiones abiertas, aprobadas e incorporadas: la proyección entra en este subproyecto **como proyección derivada de prueba**, sin sustituir al catálogo del visitante; `relational_v2` no se activa aquí en ningún caso y la bandera queda en `legacy`; la actualización de `CLAUDE.md` y `CONTINUAR-PANEL.md` es tarea documental separada, previa a la implementación y sin autorización para retirar código; y `public_products` se describe como «tabla de proyección pública derivada y sincronizada», nunca como vista materializada. Añadido a «fuera de alcance» que la retirada de Quetzaltenango es tarea aparte y no comparte rama. La sección 10 pasa de preguntas abiertas a decisiones resueltas |
| 30/08/2026 (revisión del dueño) | Seis correcciones: alcance de la regla de importación limitado a `app/**` con `scripts/**` excluido; el migrador **ya es transaccional** y la tarea pasa a verificarlo y probarlo; precisión de qué es atómico en la creación del pedido y qué no; `005` pasa de vista a **proyección materializada** por el contexto que necesita la limpieza de privacidad; la frontera de privacidad actual no se retira ni se desactiva; y criterios de aceptación 10, 11 y 12 |
