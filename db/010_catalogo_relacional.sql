-- Catálogo relacional v2. Nueve tablas que sustituyen a 28 columnas y un JSON.
--
-- NO retira nada. `products` sigue entera y el catálogo público sigue leyéndose
-- de donde se lee hoy: qué modelo se sirve lo decide la bandera `modelo_catalogo`
-- de `app_settings`, que sigue en `legacy` y cuyo cambio necesita autorización
-- expresa. Retirar el modelo viejo es el subproyecto 11.
--
-- El porqué de todo esto: hoy `power` vale la cadena '20 W', así que no se puede
-- pedir «entre 15 y 25 W». Aquí cada valor va en la columna de su tipo.
--
-- OJO CON EL TIPO: `products.id` es TEXT —un identificador heredado como
-- 'construlita-cuasar'—, no un entero. Todas las claves foráneas hacia productos
-- son por tanto `text`. Escribirlas como `bigint` hace que la migración entera
-- falle al aplicarse.
--
-- ESTA MIGRACIÓN NO ESTÁ APLICADA EN NINGUNA BASE. Ver
-- docs/superpowers/plans/2026-09-02-catalogo-relacional.md, fase B.

-- La restricción de exclusión de `product_prices` necesita comparar un entero
-- con un rango de fechas en el mismo índice, y eso solo lo hace GiST.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id          bigserial   primary key,
  -- Hacia sí misma: una categoría puede colgar de otra. `on delete restrict`
  -- para que borrar una categoría con hijas falle en vez de dejarlas huérfanas.
  parent_id   bigint      references categories(id) on delete restrict,
  slug        text        not null unique,
  nombre      text        not null,
  posicion    integer     not null default 0,
  publicada   boolean     not null default false,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint categories_slug_minusculas check (slug = lower(btrim(slug))),
  -- Una categoría no puede ser su propia madre. Los ciclos más largos no los
  -- puede evitar una restricción de columna; los detecta `hayCiclo` en
  -- `app/data/catalogo/categorias.ts` antes de escribir.
  constraint categories_sin_autopadre check (parent_id is null or parent_id <> id)
);

create index if not exists categories_parent_idx on categories (parent_id);

-- ---------------------------------------------------------------------------
-- Pertenencia de productos a categorías, con una principal
-- ---------------------------------------------------------------------------

create table if not exists product_categories (
  product_id   text    not null references products(id) on delete cascade,
  category_id  bigint  not null references categories(id) on delete restrict,
  principal    boolean not null default false,

  primary key (product_id, category_id)
);

-- El índice único PARCIAL es lo que garantiza «exactamente una principal»:
-- sobre las filas con `principal`, el producto no puede repetirse.
create unique index if not exists product_categories_una_principal
  on product_categories (product_id)
  where principal;

create index if not exists product_categories_categoria_idx
  on product_categories (category_id);

-- ---------------------------------------------------------------------------
-- Datos del proveedor — NUNCA salen al visitante
-- ---------------------------------------------------------------------------

-- Las siete columnas `supplier_*` se mudan aquí. Estar en su propia tabla es lo
-- que permite que el rol público no tenga permiso sobre ellas, en lugar de
-- depender de que cada consulta se acuerde de no seleccionarlas.
create table if not exists product_private_data (
  product_id      text   primary key references products(id) on delete cascade,
  supplier_brand  text,
  supplier_code   text,
  supplier_series text,
  supplier_name   text,
  sku             text,
  product_code    text,
  notas_internas  text
);

-- ---------------------------------------------------------------------------
-- Imágenes
-- ---------------------------------------------------------------------------

-- Copia el patrón ya probado de `project_images`: orden explícito y retirada
-- reversible con `visible`, sin borrar el archivo.
create table if not exists product_images (
  id          bigserial   primary key,
  product_id  text        not null references products(id) on delete cascade,
  url         text        not null,
  alt         text        not null default '',
  posicion    integer     not null default 0,
  visible     boolean     not null default true,
  creado_en   timestamptz not null default now()
);

create index if not exists product_images_producto_idx
  on product_images (product_id, posicion);

-- ---------------------------------------------------------------------------
-- Atributos
-- ---------------------------------------------------------------------------

create table if not exists attributes (
  id         bigserial primary key,
  clave      text      not null unique,
  nombre     text      not null,
  tipo       text      not null,
  unidad     text,
  filtrable  boolean   not null default false,
  comparable boolean   not null default false,

  constraint attributes_clave_minusculas check (clave = lower(btrim(clave))),
  -- Los mismos cinco tipos que declara `app/data/catalogo/atributos.ts`. La regla
  -- vive en los dos sitios a propósito: una que solo vigile la aplicación acaba
  -- incumpliéndose desde un script.
  constraint attributes_tipo_valido
    check (tipo in ('numero', 'texto', 'booleano', 'opcion', 'opcion_multiple'))
);

create table if not exists attribute_options (
  id           bigserial primary key,
  attribute_id bigint    not null references attributes(id) on delete cascade,
  valor        text      not null,
  posicion     integer   not null default 0,

  unique (attribute_id, valor)
);

create table if not exists category_attributes (
  category_id  bigint  not null references categories(id) on delete cascade,
  attribute_id bigint  not null references attributes(id) on delete cascade,
  posicion     integer not null default 0,

  primary key (category_id, attribute_id)
);

-- ---------------------------------------------------------------------------
-- Los valores, que es donde está la gracia del subproyecto
-- ---------------------------------------------------------------------------

create table if not exists product_attribute_values (
  id           bigserial primary key,
  product_id   text      not null references products(id) on delete cascade,
  attribute_id bigint    not null references attributes(id) on delete restrict,
  value_number numeric,
  value_text   text,
  value_bool   boolean,
  option_id    bigint    references attribute_options(id) on delete restrict,

  -- EXACTAMENTE UNA columna llena. Sin esto, '20 W' vuelve a ser una cadena y el
  -- filtro por rango deja de ser posible. Es la contrapartida en la base de
  -- `validarValor` en `app/data/catalogo/atributos.ts`.
  constraint product_attribute_values_una_columna check (
    (case when value_number is not null then 1 else 0 end) +
    (case when value_text   is not null then 1 else 0 end) +
    (case when value_bool   is not null then 1 else 0 end) +
    (case when option_id    is not null then 1 else 0 end) = 1
  )
);

-- Los dos índices que hacen barato filtrar: por rango numérico y por opción.
create index if not exists product_attribute_values_numero_idx
  on product_attribute_values (attribute_id, value_number)
  where value_number is not null;

create index if not exists product_attribute_values_opcion_idx
  on product_attribute_values (attribute_id, option_id)
  where option_id is not null;

create index if not exists product_attribute_values_producto_idx
  on product_attribute_values (product_id);

-- ---------------------------------------------------------------------------
-- Precios
-- ---------------------------------------------------------------------------

create table if not exists product_prices (
  id           bigserial   primary key,
  product_id   text        not null references products(id) on delete cascade,
  -- `bigint` y centavos enteros, igual que `public_products.price_cents`: el
  -- dinero no se guarda en coma flotante.
  centavos     bigint      not null,
  tipo         text        not null default 'normal',
  -- Inclusivo al empezar, EXCLUSIVO al terminar, para que dos periodos
  -- consecutivos no se pisen. `app/data/catalogo/precios.ts` aplica la misma
  -- regla al resolver el precio vigente.
  vigencia     tstzrange   not null default tstzrange(now(), null, '[)'),
  creado_en    timestamptz not null default now(),

  constraint product_prices_no_negativo check (centavos >= 0),
  constraint product_prices_tipo_valido check (tipo in ('normal', 'promocion'))
);

-- Dos promociones del mismo producto no pueden solaparse. Lo rechaza la BASE:
-- no depende de que la aplicación se acuerde. `haySolape` existe para poder
-- avisar antes con un mensaje entendible, no para sustituir a esto.
alter table product_prices
  drop constraint if exists product_prices_sin_promociones_solapadas;

alter table product_prices
  add constraint product_prices_sin_promociones_solapadas
  exclude using gist (
    product_id with =,
    vigencia   with &&
  ) where (tipo = 'promocion');

create index if not exists product_prices_producto_idx
  on product_prices (product_id);
