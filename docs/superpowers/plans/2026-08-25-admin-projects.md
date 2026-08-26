# Galería de proyectos administrable — Plan de implementación

> **Para agentes de implementación:** SUBHABILIDAD OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para su seguimiento.

**Objetivo:** Migrar las 12 obras y sus 104 fotografías a Neon y permitir administrarlas de forma reversible desde el panel sin cambiar el diseño de la galería pública.

**Arquitectura:** Dos tablas normalizadas (`projects` y `project_images`) conservan el orden y los estados de publicación/visibilidad. Una capa pura convierte y consulta filas, los adaptadores `*.server.ts` conectan con Neon, la portada usa una lectura cacheada con respaldo en código y el panel muta mediante Server Actions autenticadas. Las cargas múltiples van directamente del navegador a Vercel Blob mediante tokens temporales emitidos por un Route Handler protegido.

**Stack técnico:** Next.js 16.3.1 App Router, React 19.2.4, TypeScript 5.9.3 strict, Postgres 18 en Neon, `@neondatabase/serverless` 1.1, `@vercel/blob` 2.8, Tailwind CSS 4.3, Node Test y Playwright con Microsoft Edge.

**Especificación:** `docs/superpowers/specs/2026-08-25-admin-projects-design.md`

## Restricciones globales

- Trabajar desde `frontend/` y mantener la rama `panel-admin`; no usar el worktree histórico `panel-admin-auth`.
- Leer antes de implementar `AGENTS.md`, `CLAUDE.md`, `docs/CONTINUAR-PANEL.md` y la especificación enlazada arriba.
- Consultar las guías instaladas de Next.js 16.3.1 antes de usar Route Handlers, Server Actions, formularios o caché.
- Aplicar TDD: escribir la prueba que falla, observar el fallo, implementar lo mínimo y volver a ejecutar.
- Todas las páginas y acciones del panel verifican la sesión junto a sus datos o escrituras.
- Las Server Actions invalidan con `updateTag(PROJECTS_CACHE_TAG)`; el callback del Route Handler usa `revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 })`.
- No activar `cacheComponents`; conservar `unstable_cache` con revalidación de una hora.
- No añadir dependencias: Neon y Vercel Blob ya están instalados y aprobados.
- No mover, renombrar ni borrar archivos de `public/proyectos/`; no borrar objetos de Blob.
- El panel mantiene la identidad ECONOLUZ: blanco dominante, superficie azul `#001B59` y una sola acción roja `#E11133` por vista.
- Todo texto nuevo para el usuario, comentarios, commits y documentación se escribe en español.
- No hacer push, desplegar, cambiar DNS ni añadir secretos a Vercel sin autorización expresa.
- El fallo histórico permitido de la batería completa es `tests/catalog-quote.spec.ts:891`; cualquier otro fallo es una regresión.

---

## Mapa de archivos

### Datos públicos y migración

- Modificar `app/data/projects.ts`: añadir identidad interna estable y tipos explícitos; conservar las 104 rutas literales.
- Crear `app/data/projectRow.ts`: contratos de fila y conversión reversible.
- Crear `app/data/projectsQuery.ts`: consulta pública pura e inyectable.
- Crear `app/data/projects.server.ts`: conexión, caché y respaldo.
- Crear `db/004_projects.sql`: tablas, restricciones, índices y trigger.
- Crear `scripts/compare-projects.mjs`: comparación compartida por ensayo e importación.
- Crear `scripts/verify-project-rows.mjs`: ensayo sin base de datos.
- Crear `scripts/import-projects.mjs`: importación repetible y verificación posterior.

### Panel

- Crear `app/admin/proyectos/model.ts`: validación y operaciones puras de proyectos.
- Crear `app/admin/proyectos/repository.server.ts`: adaptador Neon.
- Crear `app/admin/proyectos/actions.ts`: Server Actions autenticadas.
- Crear `app/admin/proyectos/imagenes.ts`: validación, orden y visibilidad de imágenes.
- Crear `app/admin/proyectos/imagenes.server.ts`: adaptador Neon para imágenes.
- Crear `app/admin/proyectos/upload.ts`: callbacks puros para tokens y finalización de Blob.
- Crear `app/admin/(panel)/proyectos/page.tsx`: listado.
- Crear `app/admin/(panel)/proyectos/nuevo/page.tsx`: alta.
- Crear `app/admin/(panel)/proyectos/[id]/page.tsx`: ficha e imágenes.
- Crear `app/admin/(panel)/proyectos/[id]/ProjectImageUploader.tsx`: subida múltiple y progreso.
- Crear `app/admin/proyectos/subir/route.ts`: Route Handler de `handleUpload`.

### Pruebas y documentación

- Crear `tests/admin-project-rows.test.ts`.
- Crear `tests/projects-public.test.ts`.
- Crear `tests/admin-projects.test.ts`.
- Crear `tests/admin-project-images.test.ts`.
- Crear `tests/admin-project-upload.test.ts`.
- Crear `tests/projects-public.spec.ts`.
- Modificar `tests/admin-auth.spec.ts`, `package.json`, `app/page.tsx`, `app/components/ProjectSlider.tsx`, `app/admin/(panel)/page.tsx`, `CLAUDE.md`, `docs/CONTINUAR-PANEL.md` y `README.md`.

---

### Tarea 1: Identidad estable y conversión reversible

**Archivos:**
- Modificar: `app/data/projects.ts`
- Crear: `app/data/projectRow.ts`
- Crear: `scripts/compare-projects.mjs`
- Crear: `scripts/verify-project-rows.mjs`
- Crear: `tests/admin-project-rows.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produce: `ProjectSource`, `PublicProject`, `projects`, `toPublicProject`.
- Produce: `ProjectRow`, `ProjectImageRow`, `PROJECT_COLUMNS`, `PROJECT_IMAGE_COLUMNS`, `toProjectRows`, `fromProjectRows`, `PROJECT_POSITION_STEP`.
- Produce: comando local `npm run proyectos:verificar`.

- [ ] **Paso 1: Escribir la prueba roja del inventario y el viaje de ida y vuelta**

Crear `tests/admin-project-rows.test.ts` con estas comprobaciones concretas:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { projects, toPublicProject } from "../app/data/projects";
import { fromProjectRows, toProjectRows } from "../app/data/projectRow";

const TITULOS = [
  "Borghetto",
  "Agencia BMW",
  "Torre Once",
  "San Martin",
  "Insigne",
  "Casa Campo",
  "La Estación",
  "Quo",
  "Veka",
  "Desigual",
  "Geely",
  "Perfiles LED",
];

test("congela los doce proyectos y sus 104 fotografías", () => {
  assert.deepEqual(projects.map(({ title }) => title), TITULOS);
  assert.equal(projects.flatMap(({ images }) => images).length, 104);
  assert.equal(new Set(projects.map(({ id }) => id)).size, 12);
});

test("el viaje por filas conserva contenido y orden", () => {
  const rows = toProjectRows(projects);
  const rebuilt = fromProjectRows(rows.projects, rows.images);
  assert.deepEqual(rebuilt.map(toPublicProject), projects.map(toPublicProject));
  assert.deepEqual(rows.projects.map(({ position }) => position), [10,20,30,40,50,60,70,80,90,100,110,120]);
  assert.equal(rows.images.every(({ visible }) => visible), true);
});
```

- [ ] **Paso 2: Ejecutar la prueba y comprobar que falla por los módulos nuevos**

Ejecutar:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-rows.test.ts
```

Resultado esperado: `FAIL` porque `projectRow.ts`, `id` y `toPublicProject` todavía no existen.

- [ ] **Paso 3: Añadir identidades explícitas sin cambiar el contenido público**

En `app/data/projects.ts`, declarar:

```ts
export type ProjectSource = {
  id: string;
  type: string;
  title: string;
  description: string;
  images: string[];
};

export type PublicProject = Omit<ProjectSource, "id">;

export const toPublicProject = ({ type, title, description, images }: ProjectSource): PublicProject => ({
  type,
  title,
  description,
  images: [...images],
});
```

Tipar `projects` con `satisfies ProjectSource[]` y añadir, por este orden, los identificadores:

```ts
"borghetto"
"agencia-bmw"
"torre-once"
"san-martin"
"insigne"
"casa-campo"
"la-estacion"
"quo"
"veka"
"desigual"
"geely"
"perfiles-led"
```

No alterar ninguna ruta, título, tipo ni descripción.

- [ ] **Paso 4: Implementar la traducción plana y reversible**

Crear `app/data/projectRow.ts` con estas formas y constantes:

```ts
import type { ProjectSource, PublicProject } from "./projects";

export const PROJECT_POSITION_STEP = 10;

export type ProjectRow = {
  id: string;
  position: number;
  title: string;
  type: string;
  description: string;
  published: boolean;
};

export type ProjectImageRow = {
  project_id: string;
  url: string;
  position: number;
  visible: boolean;
};

export const PROJECT_COLUMNS = ["id", "position", "title", "type", "description"] as const;
export const PROJECT_IMAGE_COLUMNS = ["project_id", "url", "position"] as const;

export function toProjectRows(source: readonly ProjectSource[]) {
  return {
    projects: source.map((project, index): ProjectRow => ({
      id: project.id,
      position: (index + 1) * PROJECT_POSITION_STEP,
      title: project.title,
      type: project.type,
      description: project.description,
      published: true,
    })),
    images: source.flatMap((project) =>
      project.images.map((url, index): ProjectImageRow => ({
        project_id: project.id,
        url,
        position: (index + 1) * PROJECT_POSITION_STEP,
        visible: true,
      })),
    ),
  };
}

export function fromProjectRows(
  projectRows: readonly ProjectRow[],
  imageRows: readonly ProjectImageRow[],
): ProjectSource[] {
  const imagesByProject = Map.groupBy(imageRows, ({ project_id }) => project_id);
  return [...projectRows]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      images: [...(imagesByProject.get(row.id) ?? [])]
        .filter(({ visible }) => visible)
        .sort((a, b) => a.position - b.position)
        .map(({ url }) => url),
    }));
}

export const projectRowsToPublic = (
  projectRows: readonly ProjectRow[],
  imageRows: readonly ProjectImageRow[],
): PublicProject[] => fromProjectRows(projectRows, imageRows).map(
  ({ type, title, description, images }) => ({ type, title, description, images }),
);
```

Si TypeScript 5.9 marca `Map.groupBy` por el target configurado, usar un `Map<string, ProjectImageRow[]>` construido con un bucle; no cambiar `tsconfig.json` para habilitar una API por comodidad.

- [ ] **Paso 5: Compartir la comparación entre ensayo e importador**

Crear `scripts/compare-projects.mjs` con `compareProjects(original, rebuilt)` que compare longitud, orden y cada campo público mediante `JSON.stringify(projects.map(toPublicProject))`, y `reportProjectProblems(problems)` que imprima hasta 30 diferencias y termine con código 1 si existe alguna.

Crear `scripts/verify-project-rows.mjs` para convertir, simular que `position` vuelve como número y reconstruir. Debe imprimir exactamente los totales y reutilizar la comparación:

```js
console.log(`Proyectos leídos:  ${projects.length}`);
console.log(`Fotos leídas:      ${projects.flatMap(({ images }) => images).length}`);
console.log("");
reportProjectProblems(compareProjects(projects, rebuilt));
```

Añadir a `package.json`:

```json
"proyectos:verificar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts.mjs ./scripts/verify-project-rows.mjs"
```

- [ ] **Paso 6: Ejecutar las pruebas y el ensayo**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-rows.test.ts
npm run proyectos:verificar
npm run typecheck
npm run lint
```

Resultado esperado: todas las pruebas pasan y el ensayo informa 12 proyectos y 104 fotos sin diferencias.

- [ ] **Paso 7: Commit**

```powershell
git add app/data/projects.ts app/data/projectRow.ts scripts/compare-projects.mjs scripts/verify-project-rows.mjs tests/admin-project-rows.test.ts package.json
git commit -m "feat: prepara la migración reversible de proyectos"
```

---

### Tarea 2: Esquema Postgres e importador repetible

**Archivos:**
- Crear: `db/004_projects.sql`
- Crear: `scripts/import-projects.mjs`
- Modificar: `package.json`

**Interfaces:**
- Consume: `PROJECT_COLUMNS`, `PROJECT_IMAGE_COLUMNS`, `toProjectRows`, `fromProjectRows`.
- Produce: tablas `projects` y `project_images` y el comando operativo `npm run proyectos:importar`.

- [ ] **Paso 1: Crear la migración completa**

El SQL es configuración declarativa y no se prueba buscando cadenas en su propio
archivo: eso solo detectaría cambios de texto, no comportamiento. La tarea 8 verifica
sus restricciones de forma funcional al aplicarlo dos veces en Neon y ejecutar después
la importación y reconstrucción ya cubiertas por las pruebas de la tarea 1.

`db/004_projects.sql` debe contener:

```sql
create table if not exists projects (
  id          text        primary key,
  position    integer     not null,
  title       text        not null,
  type        text        not null,
  description text        not null,
  published   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_title_no_vacio check (btrim(title) <> ''),
  constraint projects_type_no_vacio check (btrim(type) <> ''),
  constraint projects_description_no_vacia check (btrim(description) <> '')
);

create table if not exists project_images (
  id         bigint generated always as identity primary key,
  project_id text        not null references projects(id) on delete restrict,
  url        text        not null,
  position   integer     not null,
  visible    boolean     not null default true,
  created_at timestamptz not null default now(),
  constraint project_images_url_no_vacia check (btrim(url) <> ''),
  constraint project_images_project_url_unique unique (project_id, url)
);

create index if not exists projects_position_idx on projects(position);
create index if not exists project_images_project_position_idx
  on project_images(project_id, position);

create or replace function projects_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_touch_updated_at on projects;
create trigger projects_touch_updated_at
  before update on projects
  for each row execute function projects_touch_updated_at();
```

Añadir comentarios SQL en español que expliquen por qué no hay `delete`, por qué el ID no depende del título y por qué las imágenes se ocultan en vez de borrarse.

- [ ] **Paso 2: Implementar el importador con transacción y verificación posterior**

Crear `scripts/import-projects.mjs` siguiendo `scripts/import-products.mjs`:

1. Fallar con mensaje controlado si falta `DATABASE_URL`.
2. Usar `Client` y `neonConfig.webSocketConstructor = globalThis.WebSocket`.
3. Abrir `begin` antes de escribir.
4. Insertar `PROJECT_COLUMNS` con `published = true` y `on conflict (id) do nothing`.
5. Insertar cada fotografía con `visible = true` y `on conflict (project_id, url) do nothing`.
6. Hacer `commit`; ante cualquier excepción, `rollback`.
7. Releer proyectos e imágenes ordenados.
8. Convertir `position` y `id` numérico de imagen sin asumir que Postgres devuelve `bigint` como número.
9. Reconstruir y llamar al mismo `compareProjects` de la tarea 1.
10. Imprimir 12 proyectos, 104 fotografías, publicados y visibles.

La importación no ejecuta `update` en conflicto: una segunda ejecución nunca pisa títulos, descripciones, orden ni estados editados desde el panel.

Añadir a `package.json` cuando ya exista el importador:

```json
"proyectos:importar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs ./scripts/import-projects.mjs"
```

- [ ] **Paso 3: Pasar las pruebas locales sin tocar Neon**

```powershell
node --check scripts/import-projects.mjs
npm run proyectos:verificar
npm run test:admin
npm run typecheck
npm run lint
```

No ejecutar todavía `npm run db:migrar` ni `npm run proyectos:importar`; la activación real está en la tarea 8, después de validar todo el código consumidor.

- [ ] **Paso 4: Hacer commit**

```powershell
git add db/004_projects.sql scripts/import-projects.mjs package.json docs/superpowers/plans/2026-08-25-admin-projects.md
git commit -m "feat: define el almacenamiento de proyectos en Neon"
```

---

### Tarea 3: Lectura pública cacheada con respaldo

**Archivos:**
- Crear: `app/data/projectsQuery.ts`
- Crear: `app/data/projects.server.ts`
- Modificar: `app/page.tsx`
- Modificar: `app/components/ProjectSlider.tsx`
- Crear: `tests/projects-public.test.ts`
- Crear: `tests/projects-public.spec.ts`
- Modificar: `package.json`

**Interfaces:**
- Produce: `ProjectQuery`, `readPublicProjects(query): Promise<PublicProject[]>`.
- Produce: `PROJECTS_CACHE_TAG = "proyectos"` y `getPublicProjects(): Promise<PublicProject[]>`.
- Consume: `PublicProject` en `ProjectSlider`.

- [ ] **Paso 1: Escribir pruebas rojas de agrupación, orden y contrato público**

En `tests/projects-public.test.ts`, usar una consulta falsa con filas desordenadas y comprobar:

```ts
const projects = await readPublicProjects(async () => [
  { project_id: "bmw", project_position: "20", title: "BMW", type: "Automotriz", description: "B", image_url: "/proyectos/bmw/2.jpg", image_position: "20" },
  { project_id: "uno", project_position: "10", title: "Uno", type: "Edificio", description: "A", image_url: "/proyectos/uno/1.jpg", image_position: "10" },
  { project_id: "bmw", project_position: "20", title: "BMW", type: "Automotriz", description: "B", image_url: "/proyectos/bmw/1.jpg", image_position: "10" },
]);

assert.deepEqual(projects, [
  { title: "Uno", type: "Edificio", description: "A", images: ["/proyectos/uno/1.jpg"] },
  { title: "BMW", type: "Automotriz", description: "B", images: ["/proyectos/bmw/1.jpg", "/proyectos/bmw/2.jpg"] },
]);
assert.equal("id" in projects[0], false);
```

Registrar además la consulta recibida y exigir `where p.published`, `i.visible` y ambos `order by`.

- [ ] **Paso 2: Ejecutar y comprobar el fallo por módulo ausente**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/projects-public.test.ts
```

- [ ] **Paso 3: Implementar la consulta pública pura**

Crear `app/data/projectsQuery.ts` con:

```ts
import type { PublicProject } from "./projects";

export type ProjectQuery = (
  text: string,
  params: readonly (string | number | boolean | null)[],
) => Promise<Record<string, unknown>[]>;

export async function readPublicProjects(query: ProjectQuery): Promise<PublicProject[]> {
  const rows = await query(`
    select p.id as project_id, p.position as project_position,
           p.title, p.type, p.description,
           i.url as image_url, i.position as image_position
    from projects p
    join project_images i on i.project_id = p.id and i.visible
    where p.published
    order by p.position, i.position
  `, []);

  const grouped = new Map<string, PublicProject & { position: number; imagePositions: number[] }>();
  for (const row of rows) {
    const id = String(row.project_id);
    const current = grouped.get(id) ?? {
      title: String(row.title),
      type: String(row.type),
      description: String(row.description),
      images: [],
      position: Number(row.project_position),
      imagePositions: [],
    };
    current.images.push(String(row.image_url));
    current.imagePositions.push(Number(row.image_position));
    grouped.set(id, current);
  }

  return [...grouped.values()]
    .sort((a, b) => a.position - b.position)
    .map(({ position: _position, imagePositions, ...project }) => ({
      ...project,
      images: project.images
        .map((url, index) => ({ url, position: imagePositions[index] }))
        .sort((a, b) => a.position - b.position)
        .map(({ url }) => url),
    }));
}
```

- [ ] **Paso 4: Añadir conexión, caché y respaldo**

Crear `app/data/projects.server.ts` como módulo `server-only`, siguiendo `catalog.server.ts`:

```ts
export const PROJECTS_CACHE_TAG = "proyectos";
const PROJECTS_REVALIDATE_SECONDS = 3600;

const getCachedProjects = unstable_cache(readProjectsFromDatabase, ["proyectos-publicos"], {
  tags: [PROJECTS_CACHE_TAG],
  revalidate: PROJECTS_REVALIDATE_SECONDS,
});

const projectsFromCode = () => projects.map(toPublicProject);

export async function getPublicProjects(): Promise<PublicProject[]> {
  if (!process.env.DATABASE_URL) return projectsFromCode();
  try {
    const result = await getCachedProjects();
    return result.length > 0 ? result : projectsFromCode();
  } catch (error) {
    console.error("[proyectos] Neon no respondió; se muestra la galería del código:", error);
    return projectsFromCode();
  }
}
```

La conexión usa `neon(connectionString)` dentro de la función, no a nivel de módulo.

- [ ] **Paso 5: Integrar la portada sin rediseñar el slider**

En `app/page.tsx`, retirar el import directo de `projects`, importar `getPublicProjects`, convertir `Home` en `async` y obtener:

```ts
const projects = await getPublicProjects();
```

En `ProjectSlider.tsx`, eliminar el tipo local duplicado e importar `type PublicProject` para `ProjectSliderProps`. No cambiar clases, navegación, precarga, gestos ni textos.

- [ ] **Paso 6: Añadir una prueba de navegador del contenido congelado**

Crear `tests/projects-public.spec.ts` para abrir `/#proyectos` y comprobar que “Borghetto”, “Agencia BMW” y “Perfiles LED” siguen disponibles, que inicialmente aparece `01 / 06` y que seleccionar “Agencia BMW” reinicia a `01 / 08`.

No probar estilos por clases; probar contenido y comportamiento visible.

- [ ] **Paso 7: Ejecutar pruebas y commit**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/projects-public.test.ts
npm run typecheck
npm run lint
npm run build
npx playwright test tests/projects-public.spec.ts
```

Añadir `tests/projects-public.test.ts` a `test:admin` y hacer:

```powershell
git add app/data/projectsQuery.ts app/data/projects.server.ts app/page.tsx app/components/ProjectSlider.tsx tests/projects-public.test.ts tests/projects-public.spec.ts package.json
git commit -m "feat: lee la galería pública desde Neon"
```

---

### Tarea 4: Modelo administrable de proyectos

**Archivos:**
- Crear: `app/admin/proyectos/model.ts`
- Crear: `app/admin/proyectos/repository.server.ts`
- Crear: `tests/admin-projects.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produce: `AdminProjectSummary`, `AdminProjectDetail`, `ProjectInput`, `validateProjectInput`.
- Produce: `readAdminProjects`, `readAdminProject`, `readProjectTypes`, `createProject`, `saveProject`, `moveProject`, `setProjectPublished`.
- Produce adaptadores `getAdminProjects`, `getAdminProject`, `getProjectTypes`, `createAdminProject`, `saveAdminProject`, `moveAdminProject`, `setAdminProjectPublished`.

- [ ] **Paso 1: Escribir pruebas rojas para validación y SQL parametrizado**

Crear `tests/admin-projects.test.ts` con una `queryFalsa` que registre texto y parámetros. Cubrir:

- recorte de título, tipo y descripción;
- rechazo de cualquiera de los tres vacío;
- conversión de conteos Postgres de texto a número;
- alta al final con posición `max + 10` e ID recibido como argumento;
- publicación rechazada si `visible_images = 0`;
- intercambio hacia arriba y abajo mediante un único `WITH ... UPDATE ... CASE`;
- no incrustar texto del usuario dentro del SQL;
- devolver `null` para ID inexistente.

La prueba de validación principal debe usar:

```ts
assert.deepEqual(validateProjectInput({
  title: "  Proyecto nuevo ",
  type: "  Hotel ",
  description: "  Luz arquitectónica. ",
}), {
  ok: true,
  data: { title: "Proyecto nuevo", type: "Hotel", description: "Luz arquitectónica." },
});
```

- [ ] **Paso 2: Ejecutar y observar el fallo por módulo ausente**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-projects.test.ts
```

- [ ] **Paso 3: Implementar contratos y validación pura**

En `model.ts`, reutilizar `AdminAuthQuery` y declarar:

```ts
export type ProjectInput = { title: string; type: string; description: string };
export type ProjectValidation =
  | { ok: true; data: ProjectInput }
  | { ok: false; error: string };

export type AdminProjectSummary = ProjectInput & {
  id: string;
  position: number;
  published: boolean;
  visibleImages: number;
  totalImages: number;
};

export type AdminProjectImage = {
  id: number;
  url: string;
  position: number;
  visible: boolean;
};

export type AdminProjectDetail = AdminProjectSummary & { images: AdminProjectImage[] };
```

`validateProjectInput` devuelve un único mensaje concreto por campo vacío. No añadir Zod: no está instalado y la validación es pequeña.

- [ ] **Paso 4: Implementar lecturas y escrituras inyectables**

`readAdminProjects` usa `left join` y agregados filtrados para contar visibles y totales. `readAdminProject` lee proyecto e imágenes ordenadas. `readProjectTypes` devuelve `select distinct type ... order by type`.

`createProject(query, id, input)` calcula `coalesce(max(position), 0) + 10`, inserta con `published = false` y devuelve el ID.

`saveProject` actualiza solo título, tipo y descripción. `setProjectPublished` comprueba primero las imágenes visibles cuando el destino sea `true` y devuelve `{ ok: false, error: "Añade al menos una fotografía visible antes de publicar." }` sin ejecutar el `update` si no hay ninguna.

`moveProject(query, id, direction)` ejecuta una sola sentencia atómica con CTE:

```sql
with current_project as (
  select id, position from projects where id = $1
), neighbour as (
  select id, position from projects
  where position < (select position from current_project) -- usar > y asc al bajar
  order by position desc
  limit 1
)
update projects p
set position = case
  when p.id = (select id from current_project) then (select position from neighbour)
  else (select position from current_project)
end
where p.id in ((select id from current_project), (select id from neighbour))
```

La dirección solo puede ser `"up" | "down"`; no se concatena ningún valor libre.

- [ ] **Paso 5: Crear el adaptador Neon**

`repository.server.ts` importa `server-only`, construye el mismo adaptador parametrizado que `productos/*.server.ts` y exporta una función por operación pura. Ninguna página importa `neon` directamente.

- [ ] **Paso 6: Ejecutar y commit**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-projects.test.ts
npm run typecheck
npm run lint
```

Añadir la prueba a `test:admin` y hacer:

```powershell
git add app/admin/proyectos/model.ts app/admin/proyectos/repository.server.ts tests/admin-projects.test.ts package.json
git commit -m "feat: añade el modelo administrable de proyectos"
```

---

### Tarea 5: Listado, alta y ficha de texto

**Archivos:**
- Crear: `app/admin/proyectos/actions.ts`
- Crear: `app/admin/(panel)/proyectos/page.tsx`
- Crear: `app/admin/(panel)/proyectos/nuevo/page.tsx`
- Crear: `app/admin/(panel)/proyectos/[id]/page.tsx`
- Modificar: `app/admin/(panel)/page.tsx`
- Modificar: `tests/admin-auth.spec.ts`

**Interfaces:**
- Produce Server Actions: `createProjectAction`, `saveProjectAction`, `moveProjectAction`, `setProjectPublishedAction`.
- Consume las operaciones `*.server.ts` de la tarea 4.

- [ ] **Paso 1: Añadir pruebas rojas de frontera de acceso**

Ampliar `tests/admin-auth.spec.ts` con una prueba parametrizada que abra sin sesión:

```ts
for (const route of ["/admin/proyectos", "/admin/proyectos/nuevo", "/admin/proyectos/borghetto"]) {
  test(`${route} exige sesión`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/admin\/entrar$/);
  });
}
```

- [ ] **Paso 2: Ejecutar la prueba y observar que las rutas devuelven 404**

```powershell
npx playwright test tests/admin-auth.spec.ts
```

Resultado esperado: fallan únicamente las nuevas rutas.

- [ ] **Paso 3: Implementar Server Actions con autenticación e invalidación inmediata**

En `app/admin/proyectos/actions.ts`, cada exportación empieza con `await verificarSesionParaAccion()` y valida ID, dirección y `FormData`. El patrón es:

```ts
"use server";

export async function createProjectAction(formData: FormData) {
  await verificarSesionParaAccion();
  const validation = validateProjectInput({
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!validation.ok) redirect(`/admin/proyectos/nuevo?error=${encodeURIComponent(validation.error)}`);
  const id = randomUUID();
  await createAdminProject(id, validation.data);
  updateTag(PROJECTS_CACHE_TAG);
  redirect(`/admin/proyectos/${id}?created=1`);
}
```

`saveProjectAction` redirige a la ficha con `saved=1`; `moveProjectAction` vuelve al listado; `setProjectPublishedAction` devuelve a la ficha si falla por falta de fotos y al origen indicado si tiene éxito. `redirect` queda fuera de `try/catch`.

- [ ] **Paso 4: Construir el listado**

`/admin/proyectos`:

- declara `dynamic = "force-dynamic"`;
- llama `verificarSesion()` antes de `getAdminProjects()`;
- muestra título, tipo, visibles/totales y estado;
- enlaza el título a `/admin/proyectos/<id>`;
- ofrece botones de contorno azul “Subir”, “Bajar”, “Publicar” o “Ocultar” mediante formularios de Server Action;
- deshabilita subir el primero y bajar el último;
- reserva el único botón rojo para “Nuevo proyecto”.

Usar miniatura solo si hay una imagen visible; si no, mostrar un bloque azul claro con “Sin fotografías”.

- [ ] **Paso 5: Construir alta y ficha**

`/admin/proyectos/nuevo` llama `verificarSesion()` y muestra título, tipo con `<input list="project-types">`, descripción y un único botón rojo “Crear proyecto”. El proyecto nace sin publicar.

`/admin/proyectos/[id]`:

- recibe `params: Promise<{ id: string }>`;
- llama `verificarSesion()` antes de `getAdminProject(id)`;
- usa `notFound()` si no existe;
- muestra formulario de título, tipo, descripción y botón rojo “Guardar proyecto”;
- muestra publicación como formulario secundario independiente;
- explica que no se puede publicar sin fotos y que la primera visible será la inicial;
- reserva debajo un bloque “Fotografías” que en esta tarea lista el estado actual, sin controles de carga todavía.

- [ ] **Paso 6: Activar la tarjeta de proyectos de la portada del panel**

En `app/admin/(panel)/page.tsx`, cambiar la sección a:

```ts
{
  titulo: "Galería de proyectos",
  descripcion: "Crear, ordenar y publicar obras y sus fotografías.",
  estado: "Disponible",
  href: "/admin/proyectos",
}
```

- [ ] **Paso 7: Verificar y commit**

```powershell
npm run test:admin
npm run typecheck
npm run lint
npm run build
npx playwright test tests/admin-auth.spec.ts
```

```powershell
git add app/admin/proyectos/actions.ts 'app/admin/(panel)/proyectos' 'app/admin/(panel)/page.tsx' tests/admin-auth.spec.ts
git commit -m "feat: crea las pantallas de proyectos del panel"
```

---

### Tarea 6: Orden y retirada reversible de fotografías

**Archivos:**
- Crear: `app/admin/proyectos/imagenes.ts`
- Crear: `app/admin/proyectos/imagenes.server.ts`
- Crear: `tests/admin-project-images.test.ts`
- Modificar: `app/admin/proyectos/actions.ts`
- Modificar: `app/admin/(panel)/proyectos/[id]/page.tsx`
- Modificar: `package.json`

**Interfaces:**
- Produce: `isValidProjectImageUrl`, `registerProjectImage`, `moveProjectImage`, `setProjectImageVisible`.
- Produce adaptadores: `registerAdminProjectImage`, `moveAdminProjectImage`, `setAdminProjectImageVisible`, `adminProjectExists`.
- Produce Actions: `moveProjectImageAction`, `setProjectImageVisibleAction`.

- [ ] **Paso 1: Escribir pruebas rojas de rutas, orden y reversibilidad**

Crear `tests/admin-project-images.test.ts` y cubrir:

```ts
assert.equal(isValidProjectImageUrl("/proyectos/bmw/bmw1.jpeg"), true);
assert.equal(isValidProjectImageUrl("/catalogos/x/y.webp"), false);
assert.equal(isValidProjectImageUrl("https://abc.public.blob.vercel-storage.com/proyectos/id/a.webp"), true);
assert.equal(isValidProjectImageUrl("https://otro.example/foto.webp"), false);
```

Con consultas falsas, comprobar además:

- registro al final con `max(position) + 10`;
- `on conflict (project_id, url) do nothing`;
- mover usa un único CTE y nunca cruza a otro `project_id`;
- ocultar la última foto visible de un proyecto publicado devuelve error y no actualiza;
- ocultar en un proyecto no publicado funciona;
- restaurar una imagen funciona aunque sea la única;
- IDs numéricos inválidos se rechazan antes de consultar.

- [ ] **Paso 2: Ejecutar y observar el fallo por módulo ausente**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-images.test.ts
```

- [ ] **Paso 3: Implementar validación y operaciones puras**

En `imagenes.ts`, definir el dominio permitido con la misma expresión del panel de productos, pero exigir `/proyectos/` para rutas locales y path remoto:

```ts
const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export function isValidProjectImageUrl(value: string) {
  const clean = value.trim();
  if (clean.startsWith("/proyectos/")) return true;
  try {
    const url = new URL(clean);
    return url.protocol === "https:" && BLOB_HOST.test(url.hostname) && url.pathname.startsWith("/proyectos/");
  } catch {
    return false;
  }
}
```

`registerProjectImage` comprueba proyecto, valida URL, calcula posición e inserta de forma idempotente. `moveProjectImage` intercambia posiciones en una sola sentencia CTE limitada por `project_id`. `setProjectImageVisible` relee `published` y el conteo visible antes de ocultar; devuelve un resultado discriminado con mensaje controlado.

- [ ] **Paso 4: Crear adaptadores y Actions**

`imagenes.server.ts` reutiliza el adaptador parametrizado de Neon. En `actions.ts`, las dos Actions:

1. verifican sesión;
2. validan `projectId`, `imageId` y dirección/visibilidad;
3. ejecutan la operación;
4. llaman `updateTag(PROJECTS_CACHE_TAG)` solo si cambió algo;
5. redirigen a `/admin/proyectos/<id>` con `saved=1` o `error=<mensaje>`.

- [ ] **Paso 5: Añadir controles a la ficha**

Renderizar cada foto como tarjeta con `next/image`, posición, etiqueta “Visible” u “Oculta” y formularios secundarios para “Anterior”, “Siguiente”, “Ocultar” o “Volver a mostrar”. Los botones no son rojos; usan contorno azul o rojo oscuro solo para el estado de error, no como acción principal.

Las ocultas siguen visibles en el panel con opacidad reducida. No mostrar en ningún sitio un botón “Eliminar”.

- [ ] **Paso 6: Verificar y commit**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-images.test.ts
npm run test:admin
npm run typecheck
npm run lint
npm run build
```

Añadir la prueba a `test:admin` y hacer:

```powershell
git add app/admin/proyectos/imagenes.ts app/admin/proyectos/imagenes.server.ts app/admin/proyectos/actions.ts 'app/admin/(panel)/proyectos' tests/admin-project-images.test.ts package.json
git commit -m "feat: permite ordenar y ocultar fotos de proyectos"
```

---

### Tarea 7: Subida múltiple directa a Vercel Blob

**Archivos:**
- Crear: `app/admin/proyectos/upload.ts`
- Crear: `app/admin/proyectos/subir/route.ts`
- Crear: `app/admin/(panel)/proyectos/[id]/ProjectImageUploader.tsx`
- Crear: `tests/admin-project-upload.test.ts`
- Modificar: `app/admin/(panel)/proyectos/[id]/page.tsx`
- Modificar: `package.json`

**Interfaces:**
- Produce: `parseProjectUploadPayload`, `buildProjectBlobPath`, `createProjectUploadCallbacks`.
- Produce: `POST(request: Request)` para `/admin/proyectos/subir`.
- Produce Action: `registerUploadedProjectImageAction(projectId, url)`.
- Consume: `upload` de `@vercel/blob/client` y `handleUpload` de `@vercel/blob/client`.

- [ ] **Paso 1: Escribir pruebas rojas del token y callback**

En `tests/admin-project-upload.test.ts`, comprobar:

- payload JSON válido devuelve un `projectId` no vacío;
- JSON roto o sin ID se rechaza;
- `buildProjectBlobPath("abc", "foto.JPG", "uuid")` devuelve `proyectos/abc/uuid.jpg` y nunca contiene `foto`;
- extensión MIME permitida produce `webp`, `jpg`, `png` o `avif`;
- un tipo PDF se rechaza;
- `onBeforeGenerateToken` rechaza proyecto inexistente y path fuera de su carpeta;
- la configuración emitida contiene cuatro MIME, `maximumSizeInBytes = 4 * 1024 * 1024`, `addRandomSuffix = false` y `tokenPayload` con el proyecto;
- `onUploadCompleted` registra exactamente `blob.url` y es idempotente por contrato del repositorio.
- el registro autenticado posterior a `upload()` acepta la misma URL sin duplicarla.

- [ ] **Paso 2: Ejecutar y observar el fallo por módulo ausente**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-upload.test.ts
```

- [ ] **Paso 3: Implementar la lógica de subida sin Next ni red**

`upload.ts` no importa `server-only`, Next ni Vercel. Define dependencias inyectables:

```ts
type UploadDependencies = {
  projectExists: (projectId: string) => Promise<boolean>;
  registerImage: (projectId: string, url: string) => Promise<void>;
};

export function createProjectUploadCallbacks(deps: UploadDependencies) {
  return {
    async before(pathname: string, clientPayload: string | null) {
      const { projectId } = parseProjectUploadPayload(clientPayload);
      if (!(await deps.projectExists(projectId))) throw new Error("Ese proyecto no existe.");
      if (!pathname.startsWith(`proyectos/${projectId}/`)) throw new Error("La ruta de subida no pertenece al proyecto.");
      return {
        allowedContentTypes: ["image/webp", "image/jpeg", "image/png", "image/avif"],
        maximumSizeInBytes: 4 * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: false,
        tokenPayload: JSON.stringify({ projectId }),
      };
    },
    async completed(blob: { url: string }, tokenPayload: string | null) {
      const { projectId } = parseProjectUploadPayload(tokenPayload);
      await deps.registerImage(projectId, blob.url);
    },
  };
}
```

- [ ] **Paso 4: Implementar el Route Handler protegido**

En `app/admin/proyectos/subir/route.ts`:

```ts
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token") {
    await verificarSesion();
  }

  const callbacks = createProjectUploadCallbacks({
    projectExists: adminProjectExists,
    registerImage: registerAdminProjectImage,
  });

  try {
    const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_BLOB_CALLBACK_URL);
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: (pathname, payload) => callbacks.before(pathname, payload),
      ...(onVercel ? {
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          await callbacks.completed(blob, tokenPayload ?? null);
          revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 });
        },
      } : {}),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[proyectos] falló la subida o su registro:", error);
    return Response.json({ error: "No se pudo completar la subida." }, { status: 400 });
  }
}
```

No usar `updateTag` aquí: Next 16.3.1 lo limita a Server Actions.

El callback se omite en `localhost` salvo que exista `VERCEL_BLOB_CALLBACK_URL`, porque
el servicio de Blob no puede llamar a una dirección local. El registro inmediato de la
URL se realiza también mediante la Server Action del paso siguiente.

- [ ] **Paso 5: Crear el componente cliente de subida múltiple**

`ProjectImageUploader.tsx` recibe únicamente `{ projectId: string }`. Mantiene una lista local `{ name, status, error }`, valida tipo y 4 MB antes de empezar y procesa archivos secuencialmente para que cada resultado sea independiente:

```ts
const blob = await upload(
  buildProjectBlobPath(projectId, file.name, crypto.randomUUID()),
  file,
  {
    access: "public",
    handleUploadUrl: "/admin/proyectos/subir",
    clientPayload: JSON.stringify({ projectId }),
  },
);
await registerUploadedProjectImageAction(projectId, blob.url);
```

Añadir a `app/admin/proyectos/actions.ts` `registerUploadedProjectImageAction(projectId, url)`: verifica la sesión, valida el proyecto y la URL mediante `registerAdminProjectImage`, llama `updateTag(PROJECTS_CACHE_TAG)` y devuelve `{ ok: true }` sin redirigir. La restricción `unique(project_id, url)` hace compatible esta escritura con el callback de producción.

Al terminar todos, llamar `router.refresh()`. Mostrar progreso con `aria-live="polite"`, deshabilitar el selector mientras se procesa y mantener visibles los errores individuales. El botón de selección usa estilo secundario azul; el botón rojo de la ficha sigue siendo “Guardar proyecto”.

- [ ] **Paso 6: Integrar la subida en la ficha**

Insertar `ProjectImageUploader projectId={project.id}` encima de las miniaturas. Explicar formatos y máximo de 4 MB por archivo. No pasar `BLOB_READ_WRITE_TOKEN`, URLs internas de sesión ni objetos completos de repositorio al componente.

- [ ] **Paso 7: Verificar y commit**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-project-upload.test.ts
npm run test:admin
npm run typecheck
npm run lint
npm run build
npx playwright test tests/admin-auth.spec.ts tests/projects-public.spec.ts tests/catalog-production-boundary.spec.ts
```

Añadir la prueba a `test:admin` y hacer:

```powershell
git add app/admin/proyectos/upload.ts app/admin/proyectos/subir/route.ts app/admin/proyectos/actions.ts 'app/admin/(panel)/proyectos' tests/admin-project-upload.test.ts package.json
git commit -m "feat: sube varias fotos de proyectos a Vercel Blob"
```

---

### Tarea 8: Activación en Neon, verificación real y documentación

**Archivos:**
- Modificar: `CLAUDE.md`
- Modificar: `docs/CONTINUAR-PANEL.md`
- Modificar: `README.md`

**Interfaces:**
- Consume: `npm run db:migrar`, `npm run proyectos:importar` y todas las comprobaciones anteriores.
- Produce: paso 1 cerrado y documentación coherente con la rama real.

- [ ] **Paso 1: Verificación previa obligatoria antes de escribir en Neon**

```powershell
git status --short
npm run proyectos:verificar
npm run test:admin
npm run typecheck
npm run lint
npm run build
```

Resultado esperado: árbol limpio salvo los cambios de la tarea en curso; ensayo 12/104; unidad, tipos, lint y build correctos. Si cualquiera falla, no ejecutar migración ni importación.

- [ ] **Paso 2: Aplicar el esquema repetible**

```powershell
npm run db:migrar
```

Resultado esperado: `004_projects.sql` aparece como `APLICADA`; una segunda ejecución debe indicar `ya estaba`.

- [ ] **Paso 3: Importar y releer Neon**

```powershell
npm run proyectos:importar
```

Resultado esperado: 12 proyectos, 104 fotografías, 12 publicados, 104 visibles y comparación exacta sin diferencias. Ejecutarlo una segunda vez y confirmar que no duplica filas.

- [ ] **Paso 4: Prueba real reversible en local**

Con `npm run dev`:

1. Entrar en `/admin/proyectos` con la sesión existente.
2. Cambiar el título de “Agencia BMW” por “Agencia BMW — prueba”.
3. Abrir `/#proyectos` y comprobar el cambio sin reiniciar ni desplegar.
4. Restaurar “Agencia BMW”.
5. Ocultar una fotografía de BMW, comprobar que el contador pasa de 8 a 7 y volver a mostrarla.
6. Despublicar BMW, comprobar que desaparece y volver a publicarlo.
7. Subir una imagen de prueba menor de 4 MB, comprobar su aparición y dejarla oculta. No borrar el objeto de Blob.

Si la sesión o `BLOB_READ_WRITE_TOKEN` faltan, registrar exactamente cuál de las dos comprobaciones no pudo realizarse; no simular un éxito.

- [ ] **Paso 5: Ejecutar la batería completa**

Cerrar `npm run dev` antes de Playwright y ejecutar:

```powershell
npm run test:admin
npm run typecheck
npm run lint
npm run build
npx playwright test
```

Resultado esperado: todas las pruebas nuevas pasan. Solo se acepta el fallo histórico de `tests/catalog-quote.spec.ts:891`; guardar el resumen exacto de pases/fallos para la documentación.

- [ ] **Paso 6: Actualizar los documentos sin conservar estados contradictorios**

En `CLAUDE.md`:

- cambiar “Paso 1 en curso” por “Paso 1 terminado”;
- documentar tablas `projects` y `project_images`, comandos `proyectos:*` y rutas del panel;
- registrar el resultado real de pruebas y la activación en Neon;
- mantener como bloqueadores de despliegue `ADMIN_SESSION_SECRET` y `BLOB_READ_WRITE_TOKEN` en Vercel.

En `docs/CONTINUAR-PANEL.md`:

- marcar el paso e como terminado;
- eliminar o corregir los párrafos históricos que todavía dicen que c, d o la integración de `panel-admin-auth` están pendientes;
- dejar como siguiente trabajo el paso 2, tienda B2C;
- conservar la prohibición de push/despliegue sin permiso.

En `README.md`, cambiar la descripción de `projects.ts` a respaldo y añadir la lectura desde Neon y las rutas administrativas.

- [ ] **Paso 7: Verificar documentación y commit final**

```powershell
rg -n "Galería de proyectos.*En construcción|falta la galería|panel-admin-auth.*no.*fusionada|c\. El panel de productos|d\. Subida" CLAUDE.md docs/CONTINUAR-PANEL.md README.md
git diff --check
git status --short
```

El primer comando no debe encontrar afirmaciones vigentes que contradigan el estado final; las menciones históricas claramente etiquetadas pueden permanecer.

```powershell
git add CLAUDE.md docs/CONTINUAR-PANEL.md README.md
git commit -m "docs: cierra el panel de proyectos"
```

- [ ] **Paso 8: Comprobación final de rama sin publicar**

```powershell
git status
git log -8 --oneline
git branch -vv
```

Resultado esperado: árbol limpio, rama `panel-admin`, commits locales y sin upstream de `panel-admin`. No ejecutar `git push`, Vercel CLI ni acciones de despliegue.
