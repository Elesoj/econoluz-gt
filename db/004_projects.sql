-- Galería de obras ejecutadas administrable desde el panel.
--
-- Los proyectos vivían en app/data/projects.ts. Estas tablas conservan el
-- mismo contenido y orden, pero permiten editarlo sin cambiar código.

create table if not exists projects (
  -- Identidad interna estable. No depende del título: renombrar una obra no
  -- cambia su fila ni duplica una importación posterior.
  id          text        primary key,
  position    integer     not null,
  title       text        not null,
  type        text        not null,
  description text        not null,

  -- Las altas nacen ocultas para no publicar una ficha sin fotografías.
  published   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint projects_title_no_vacio check (btrim(title) <> ''),
  constraint projects_type_no_vacio check (btrim(type) <> ''),
  constraint projects_description_no_vacia check (btrim(description) <> '')
);

create table if not exists project_images (
  id         bigint generated always as identity primary key,

  -- No hay borrado permanente desde el panel. `on delete restrict` impide
  -- que una eliminación accidental del proyecto se lleve también sus fotos.
  project_id text        not null references projects(id) on delete restrict,
  url        text        not null,
  position   integer     not null,

  -- Ocultar es reversible y nunca borra el archivo local ni el objeto Blob.
  visible    boolean     not null default true,
  created_at timestamptz not null default now(),

  constraint project_images_url_no_vacia check (btrim(url) <> ''),
  constraint project_images_project_url_unique unique (project_id, url)
);

create index if not exists projects_position_idx on projects (position);
create index if not exists project_images_project_position_idx
  on project_images (project_id, position);

create or replace function projects_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_touch_updated_at on projects;
create trigger projects_touch_updated_at
  before update on projects
  for each row
  execute function projects_touch_updated_at();
