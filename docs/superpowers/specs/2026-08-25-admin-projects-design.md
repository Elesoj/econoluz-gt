# Galería de proyectos administrable — Diseño

**Fecha:** 25/08/2026
**Estado:** aprobado por el dueño del proyecto

## 1. Objetivo

Sacar la galería de obras ejecutadas de `app/data/projects.ts`, guardarla en Neon y
permitir que el dueño cree, edite, ordene, publique y despublique proyectos y sus
fotografías desde el panel. La portada conservará el diseño y el comportamiento actual
de `ProjectSlider`.

El alcance inicial incluye los 12 proyectos y las 104 fotografías actuales: Borghetto,
Agencia BMW, Torre Once, San Martin, Insigne, Casa Campo, La Estación, Quo, Veka,
Desigual, Geely y Perfiles LED.

## 2. Decisiones de alcance

- La galería pública no se rediseña. Solo cambia su fuente de datos.
- El panel permite listar, crear y editar proyectos; cambiar su orden; y publicarlos o
  despublicarlos.
- Cada proyecto permite subir varias fotografías, ordenarlas, ocultarlas y volver a
  mostrarlas.
- No habrá eliminación permanente de proyectos ni fotografías en esta versión.
- Ocultar una fotografía solo cambia su estado en Neon. Nunca borra el archivo local ni
  el objeto de Vercel Blob.
- La primera fotografía visible según su posición es la imagen inicial del proyecto.
- El tipo de proyecto es texto obligatorio con sugerencias de los valores existentes,
  pero admite valores nuevos.
- Las nuevas fotografías se guardan en el almacén Vercel Blob ya configurado.
- No se mueve, renombra ni borra ningún archivo de `public/proyectos/`.
- No se publica, despliega ni hace push sin autorización expresa del dueño.

## 3. Modelo de datos

La migración `db/004_projects.sql` crea dos tablas.

### `projects`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `text` | Clave primaria interna, estable e inmutable. |
| `position` | `integer` | Orden público, con huecos de diez en diez. |
| `title` | `text` | Obligatorio y no vacío. |
| `type` | `text` | Obligatorio y no vacío. |
| `description` | `text` | Obligatorio y no vacío. |
| `published` | `boolean` | `true` para los 12 actuales; `false` por defecto en altas nuevas. |
| `created_at` | `timestamptz` | `now()`. |
| `updated_at` | `timestamptz` | Se actualiza mediante trigger. |

### `project_images`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `bigint generated always as identity` | Clave primaria interna. |
| `project_id` | `text` | Clave externa a `projects(id)`. |
| `url` | `text` | Ruta local o URL pública válida de Vercel Blob. |
| `position` | `integer` | Orden dentro del proyecto, con huecos de diez en diez. |
| `visible` | `boolean` | Permite retirar y restaurar una foto sin perderla. |
| `created_at` | `timestamptz` | `now()`. |

Los proyectos actuales reciben identificadores explícitos y seguros en
`app/data/projects.ts` —por ejemplo, `borghetto` y `agencia-bmw`—. Las altas nuevas
usan `crypto.randomUUID()`, para que renombrar un proyecto no cambie su identidad. La
base de datos tendrá índices para el orden de los proyectos y para
`project_images(project_id, position)`, además de una restricción única sobre
`project_images(project_id, url)` que hace idempotentes las importaciones y los
callbacks de Blob. La aplicación no expondrá estos identificadores en la galería
pública.

No se añade una tabla de tipos: los siete valores actuales no forman una taxonomía de
negocio cerrada y un proyecto futuro puede necesitar otro.

## 4. Conversión e importación reversible

`app/data/projectRow.ts` define los tipos de fila y las funciones puras que convierten
el catálogo actual de proyectos en filas y reconstruyen el mismo valor público.
`app/data/projects.ts` sigue existiendo como respaldo.

La migración de datos se realiza en este orden:

1. Convertir los 12 proyectos y las 104 rutas a filas solo en memoria.
2. Simular las formas en que Postgres devuelve `bigint` y JSON.
3. Reconstruir los proyectos y compararlos con el valor original, incluido el orden.
4. Aplicar `db/004_projects.sql` mediante el migrador repetible.
5. Importar con una transacción repetible: `insert ... on conflict do nothing` para no
   alterar campos administrados por el panel después de la primera importación.
6. Releer ambas tablas desde Neon, reconstruir y volver a comparar.

Que los `insert` terminen sin error no cuenta como verificación. Cualquier diferencia
en títulos, tipos, descripciones, rutas, cantidad u orden detiene el proceso.

## 5. Lectura pública y caché

`app/data/projects.server.ts` ofrece `getPublicProjects()` y
`PROJECTS_CACHE_TAG`.

- Con `DATABASE_URL`, consulta proyectos publicados y fotografías visibles, ambos en
  orden.
- Sin `DATABASE_URL`, devuelve los datos de `app/data/projects.ts`.
- Si Neon falla, registra el error en el servidor y devuelve el respaldo del código.
- La consulta se almacena mediante `unstable_cache`, con una hora de revalidación y una
  etiqueta propia.
- Todas las Server Actions que cambien proyectos o imágenes ejecutan
  `updateTag(PROJECTS_CACHE_TAG)` después de una escritura correcta.

`app/page.tsx` pasa a ser asíncrona y obtiene los proyectos antes de pasarlos a
`ProjectSlider`. El contrato público conserva exactamente `title`, `type`,
`description` e `images`; el componente no necesita rediseño.

Si un error de datos deja cero proyectos publicables, la portada usa el respaldo en vez
de renderizar un slider sin proyecto activo.

## 6. Panel de administración

### Listado: `/admin/proyectos`

Muestra todos los proyectos, incluidos los no publicados, con:

- título y tipo;
- número de fotografías visibles y totales;
- estado de publicación;
- enlaces a la ficha y al alta;
- acciones para subir o bajar un proyecto una posición;
- acción reversible para publicar o despublicar.

No hay borrado permanente. Las acciones de orden intercambian posiciones en una
transacción para no dejar estados intermedios.

### Alta: `/admin/proyectos/nuevo`

Pide título, tipo y descripción. El proyecto nace sin publicar y al guardarlo redirige
a su ficha. Se añaden las fotografías después de crear el proyecto para que cada subida
tenga desde el principio un identificador de destino válido.

### Ficha: `/admin/proyectos/[id]`

Permite:

- editar título, tipo y descripción;
- publicar o despublicar;
- seleccionar y subir varias fotografías;
- ver miniaturas activas y ocultas;
- mover cada fotografía hacia delante o hacia atrás;
- ocultar una fotografía y volver a mostrarla.

No se puede publicar un proyecto sin al menos una fotografía visible. El panel explica
que la primera fotografía visible es la imagen inicial del proyecto.

El formulario principal y los datos siguen siendo de servidor. Solo el selector y el
progreso de subida múltiple necesitan un componente de cliente; este componente recibe
el identificador del proyecto y datos públicos de sus fotos, nunca secretos ni datos de
proveedor.

## 7. Subida directa a Vercel Blob

Las subidas múltiples no atraviesan una Server Action: Vercel limita las peticiones al
servidor a 4,5 MB. Se utiliza `@vercel/blob/client` para enviar cada archivo directamente
desde el navegador al almacén.

Una ruta `POST /admin/proyectos/subir` usa `handleUpload` de `@vercel/blob/client`:

1. La solicitud de token llama a la frontera de autorización del panel.
2. Comprueba que el proyecto existe y que el nombre de destino pertenece a
   `proyectos/<id>/`.
3. Emite un token temporal limitado a `image/webp`, `image/jpeg`, `image/png` e
   `image/avif`, con un máximo de 4 MB y sufijo aleatorio.
4. Incluye el identificador del proyecto en `tokenPayload`.
5. Al completarse la subida, el callback firmado de Vercel Blob valida el payload,
   registra la URL como una nueva `project_image` visible al final y evita duplicados.

Después de que `upload()` devuelve la URL, el componente cliente llama además a una
Server Action autenticada que registra esa misma URL antes de mostrar la subida como
terminada. La restricción única hace que esta escritura y el callback sean idempotentes.
Este segundo camino no es redundancia accidental: en desarrollo local Vercel Blob no
puede llamar a un `localhost`, y en producción el callback sirve de respaldo si el
navegador pierde la conexión justo después de subir el archivo.

`BLOB_READ_WRITE_TOKEN` permanece en el servidor. El nombre original se descarta para
la URL final. Cada archivo informa su propio progreso y error; el fallo de uno no impide
que los demás terminen.

Si Blob termina la carga pero Neon no puede registrar la fila, el archivo queda en el
almacén y no se elimina automáticamente. El callback es idempotente, de modo que puede
reintentarse sin crear duplicados, y el servidor deja constancia del error. Esta
política respeta la prohibición de borrar sin permiso.

## 8. Validación, seguridad y errores

- Cada página protegida llama a `verificarSesion()` junto a su lectura.
- Cada Server Action llama a `verificarSesionParaAccion()` antes de escribir.
- La emisión del token de subida exige una sesión válida. El callback de finalización
  se valida mediante el mecanismo firmado de `handleUpload` y no confía en datos libres
  enviados por el navegador.
- Título, tipo y descripción se recortan y no pueden quedar vacíos.
- Las posiciones se calculan en el servidor; el navegador no decide el orden final.
- Una ruta local debe empezar por `/proyectos/`. Una URL remota debe usar HTTPS y el
  dominio público autorizado de Vercel Blob.
- No se puede publicar sin una fotografía visible.
- Un proyecto despublicado o una foto oculta conservan todos sus datos.
- Los errores esperables se muestran en español sin incluir SQL, variables de entorno,
  tokens ni detalles internos.
- Las escrituras que cambian más de una posición se hacen dentro de una transacción.

## 9. Pruebas y criterios de aceptación

### Automatizadas

- Conversión reversible exacta de los 12 proyectos y las 104 imágenes.
- Validación de textos, rutas, publicación y orden.
- Consultas del listado y de la ficha sin depender de Neon real.
- Acciones de alta, edición, orden, publicación, ocultación y restauración.
- Emisión de tokens de Blob solo con sesión y proyecto válidos.
- Registro autenticado de la URL devuelta al navegador.
- Registro idempotente del callback de subida.
- Respaldo del código cuando falta `DATABASE_URL` o falla Neon.
- La portada recibe el mismo contrato público y conserva el contenido y el orden.
- El panel continúa sin aparecer en índices y todas sus rutas siguen protegidas.
- `npm run test:admin`, `npm run typecheck`, `npm run lint`, `npm run build` y la batería
  de Playwright mantienen su estado conocido.

El único fallo aceptado en la batería completa es el histórico documentado en
`tests/catalog-quote.spec.ts:891`; cualquier fallo nuevo es una regresión.

### Verificación real

- Después de importar, Neon reconstruye exactamente los 12 proyectos y las 104 rutas.
- Cambiar un texto en el panel se refleja en la portada sin desplegar.
- Despublicar un proyecto lo retira y volver a publicarlo lo restaura.
- Ocultar una foto la retira y volver a mostrarla la restaura.
- Subir varias imágenes informa el resultado individual de cada archivo.
- Restaurar el contenido probado deja la portada igual que antes de la comprobación.

## 10. Fuera de alcance

- Rediseñar `ProjectSlider` o crear páginas individuales de proyectos.
- Editar los textos del resto de la portada.
- Etiquetas SEO específicas por proyecto.
- Borrado físico de archivos locales o de Vercel Blob.
- Borrado permanente de proyectos o filas de imágenes.
- Mover o renombrar las 104 fotografías existentes.
- Push, despliegue o cambios de DNS.
