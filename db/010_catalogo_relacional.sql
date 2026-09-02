-- Núcleo relacional de productos. OCHO tablas nuevas.
--
-- NO retira nada. `products` sigue entera y el catálogo público sigue leyéndose de donde se
-- lee hoy: qué modelo se sirve lo decide la bandera `modelo_catalogo` de `app_settings`, que
-- sigue en `legacy` y cuyo cambio necesita autorización expresa. Retirar el modelo viejo es
-- el subproyecto 11.
--
-- `public_products` NO es una novena tabla de este subproyecto: ya existe como proyección
-- derivada y saneada, y se reconstruye desde aquí.
--
-- NO EXISTE NINGUNA RELACIÓN ENTRE CATEGORÍAS Y ATRIBUTOS. Una categoría clasifica
-- productos; una característica describe al producto concreto que la posee. Al editar un
-- producto, el administrador elige sus atributos con independencia de sus categorías.
--
-- El porqué de todo esto: hoy `power` vale la cadena '20 W', así que no se puede pedir
-- «entre 15 y 25 W». Aquí el valor real es 20, en su columna, y la unidad vive en el
-- atributo.
--
-- OJO CON EL TIPO: `products.id` es TEXT —un identificador heredado como
-- 'construlita-cuasar'—, no un entero. Todas las claves foráneas hacia productos son por
-- tanto `text`. Escribirlas como `bigint` hace que la migración entera falle al aplicarse.
--
-- ESTA MIGRACIÓN NO ESTÁ APLICADA EN NINGUNA BASE. Ver
-- docs/superpowers/plans/2026-09-02-catalogo-relacional.md, fase B.

-- La restricción de exclusión de `product_prices` compara un texto con un rango de fechas
-- en el mismo índice, y eso solo lo hace GiST.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Categorías — clasifican, y nada más
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id             bigserial   primary key,
  -- Hacia sí misma: una categoría puede colgar de otra. `on delete restrict` para que
  -- borrar una categoría con hijas falle en vez de dejarlas huérfanas.
  parent_id      bigint      references categories(id) on delete restrict,
  slug           text        not null unique,
  nombre         text        not null,
  posicion       integer     not null default 0,
  publicada      boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint categories_slug_minusculas check (slug = lower(btrim(slug))),
  -- Una categoría no puede ser su propia madre. Los ciclos más largos no los puede evitar
  -- una restricción de columna; los detecta `hayCiclo` en `app/data/catalogo/categorias.ts`.
  constraint categories_sin_autopadre check (parent_id is null or parent_id <> id)
);

create index if not exists categories_parent_idx on categories (parent_id);

-- ---------------------------------------------------------------------------
-- 2. Pertenencia de productos a categorías, con una principal
-- ---------------------------------------------------------------------------

create table if not exists product_categories (
  product_id  text    not null references products(id) on delete cascade,
  category_id bigint  not null references categories(id) on delete restrict,
  principal   boolean not null default false,

  primary key (product_id, category_id)
);

-- Solo acelera la búsqueda de la principal. NO es único: la comprobación se difiere hasta
-- confirmar la transacción, para admitir el reemplazo de la principal sin estados
-- intermedios artificialmente inválidos.
create index if not exists product_categories_principal_idx
  on product_categories (product_id)
  where principal;

create index if not exists product_categories_categoria_idx
  on product_categories (category_id);

-- El índice de arriba solo busca. Esto garantiza exactamente UNA principal al confirmar y
-- admite estados intermedios con cero o varias mientras se reemplaza el conjunto completo.
-- La fila padre se bloquea antes de contar para serializar dos escrituras concurrentes del
-- mismo producto: sin ese bloqueo, cada transacción podría ver solo su propia principal.
create or replace function product_categories_exige_principal() returns trigger
language plpgsql as $$
declare
  producto     text;
  productos    text[] := array[]::text[];
  total        integer;
  principales  integer;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    productos := array_append(productos, old.product_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    productos := array_append(productos, new.product_id);
  end if;

  foreach producto in array productos loop
    perform 1
      from products
     where id = producto
       for update;

    select count(*), count(*) filter (where principal)
      into total, principales
      from product_categories
     where product_id = producto;

    if total > 0 and principales <> 1 then
      raise exception
        'El producto % tiene % categoria(s) y % principal(es): hace falta exactamente una',
        producto, total, principales
        using errcode = 'check_violation';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists product_categories_principal_obligatoria on product_categories;

create constraint trigger product_categories_principal_obligatoria
  after insert or update or delete on product_categories
  deferrable initially deferred
  for each row execute function product_categories_exige_principal();

-- ---------------------------------------------------------------------------
-- 3. Datos privados del proveedor — NUNCA salen al visitante
-- ---------------------------------------------------------------------------

-- Los siete datos privados del diseño, y ni uno más.
--
-- `supplier_code` es el código con el que ECONOLUZ vende internamente. Es editable y
-- buscable en el panel, nunca público, y **no es único** a propósito: hay registros que
-- contienen varios códigos separados por barras. Los dos alias que hoy tiene ese mismo dato
-- en el modelo antiguo NO se convierten en columnas propias: duplicarlo garantiza que algún
-- día discrepen. Separar variantes es materia del ERP y queda fuera de este subproyecto.
create table if not exists product_private_data (
  product_id            text primary key references products(id) on delete cascade,
  supplier_brand        text,
  supplier_brand_label  text,
  supplier_series       text,
  supplier_series_label text,
  supplier_code         text,
  supplier_name         text,
  supplier_description  text
);

create index if not exists product_private_data_supplier_code_idx
  on product_private_data (supplier_code);

-- ---------------------------------------------------------------------------
-- 4. Imágenes
-- ---------------------------------------------------------------------------

-- El panel retira imágenes de forma reversible con `visible` y no ofrece borrado permanente.
-- `on delete restrict` evita que eliminar por accidente un producto borre las referencias
-- de la base mientras los archivos locales o de Blob siguen existiendo fuera de ella.
create table if not exists product_images (
  id         bigserial   primary key,
  product_id text        not null references products(id) on delete restrict,
  url        text        not null,
  alt        text        not null default '',
  posicion   integer     not null default 0,
  visible    boolean     not null default true,
  principal  boolean     not null default false,
  creado_en  timestamptz not null default now(),

  -- Diferida para poder intercambiar dos posiciones en un único UPDATE. El estado final
  -- sigue siendo único; lo que se permite es el choque transitorio mientras se mueven.
  constraint product_images_posicion_unica
    unique (product_id, posicion) deferrable initially deferred
);

create unique index if not exists product_images_una_principal
  on product_images (product_id)
  where principal;

create index if not exists product_images_producto_idx
  on product_images (product_id, posicion);

-- ---------------------------------------------------------------------------
-- 5. Atributos
-- ---------------------------------------------------------------------------

create table if not exists attributes (
  id             bigserial   primary key,
  clave          text        not null unique,
  nombre         text        not null,
  tipo           text        not null,
  unidad         text,
  filterable     boolean     not null default false,
  comparable     boolean     not null default false,
  -- Lo que nunca se usó puede borrarse; desde el primer uso solo puede desactivarse, y la
  -- clave sigue reservada para que nadie la reutilice con otro significado.
  active         boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint attributes_clave_minusculas check (clave = lower(btrim(clave))),
  -- Los mismos cinco tipos que declara `app/data/catalogo/atributos.ts`. La regla vive en
  -- los dos sitios a propósito: una que solo vigile la aplicación acaba incumpliéndose
  -- desde un script.
  constraint attributes_tipo_valido
    check (tipo in ('numero', 'texto', 'booleano', 'opcion', 'opcion_multiple')),

  -- Redundante con la clave primaria, pero necesaria: es el destino de la clave foránea
  -- compuesta que congela el tipo de un atributo en cuanto tiene valores.
  unique (id, tipo)
);

create table if not exists attribute_options (
  id             bigserial   primary key,
  attribute_id   bigint      not null references attributes(id) on delete cascade,
  clave          text        not null,
  etiqueta       text        not null,
  posicion       integer     not null default 0,
  active         boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (attribute_id, clave),
  -- También redundante y también necesaria: destino de la clave foránea compuesta que
  -- garantiza que la opción elegida sea de ese atributo y no de otro.
  unique (id, attribute_id)
);

-- ---------------------------------------------------------------------------
-- 6. Los valores, que es donde está la gracia del subproyecto
-- ---------------------------------------------------------------------------

create table if not exists product_attribute_values (
  id             bigserial primary key,
  product_id     text      not null references products(id) on delete cascade,
  attribute_id   bigint    not null,
  -- Copia del tipo del atributo. Existe para que las tres reglas de abajo las pueda
  -- comprobar la BASE y no dependan de que la aplicación se acuerde.
  attribute_type text      not null,
  value_number   numeric,
  value_text     text,
  value_bool     boolean,
  option_id      bigint,

  -- Exactamente una columna llena. Sin esto, '20 W' vuelve a ser una cadena.
  constraint product_attribute_values_una_columna check (
    (case when value_number is not null then 1 else 0 end) +
    (case when value_text   is not null then 1 else 0 end) +
    (case when value_bool   is not null then 1 else 0 end) +
    (case when option_id    is not null then 1 else 0 end) = 1
  ),

  -- Y que sea la columna que corresponde al tipo declarado del atributo.
  constraint product_attribute_values_columna_del_tipo check (
    (attribute_type = 'numero'   and value_number is not null) or
    (attribute_type = 'texto'    and value_text   is not null) or
    (attribute_type = 'booleano' and value_bool   is not null) or
    (attribute_type in ('opcion', 'opcion_multiple') and option_id is not null)
  ),

  -- CAMBIAR EL TIPO DE UN ATRIBUTO USADO LO RECHAZA LA BASE. Si alguien intenta un
  -- `update attributes set tipo = ...` sobre un atributo con valores, esta clave foránea
  -- compuesta lo impide, en vez de reinterpretar en silencio los datos ya guardados.
  constraint product_attribute_values_atributo_fk
    foreign key (attribute_id, attribute_type) references attributes (id, tipo)
    on update restrict on delete restrict,

  -- LA OPCIÓN TIENE QUE SER DE ESE ATRIBUTO. Es el error que un desplegable hace fácil:
  -- guardar la opción «3000 K» de temperatura dentro del atributo ambiente.
  constraint product_attribute_values_opcion_fk
    foreign key (option_id, attribute_id) references attribute_options (id, attribute_id)
    on update restrict on delete restrict,

  -- NUNCA LA MISMA OPCIÓN DOS VECES. Para los escalares `option_id` es null y en un índice
  -- único los nulos no chocan entre sí, así que esta restricción no les afecta: de ellos se
  -- ocupa el índice parcial de abajo.
  unique (product_id, attribute_id, option_id)
);

-- UN SOLO VALOR ESCALAR por producto y atributo. `opcion_multiple` queda fuera porque es
-- justo el tipo que sí admite varias filas.
create unique index if not exists product_attribute_values_escalar_unico
  on product_attribute_values (product_id, attribute_id)
  where attribute_type <> 'opcion_multiple';

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
-- 7. Precios
-- ---------------------------------------------------------------------------

create table if not exists product_prices (
  id         bigserial   primary key,
  product_id text        not null references products(id) on delete cascade,
  -- `bigint` y centavos enteros, igual que `public_products.price_cents`: el dinero no se
  -- guarda en coma flotante. El inventario no vive aquí ni en este subproyecto.
  centavos   bigint      not null,
  tipo       text        not null default 'normal',
  -- Inclusivo al empezar, EXCLUSIVO al terminar, para que dos periodos consecutivos no se
  -- pisen. `app/data/catalogo/precios.ts` aplica la misma regla al resolver el vigente.
  vigencia   tstzrange   not null default tstzrange(now(), null, '[)'),
  creado_en  timestamptz not null default now(),

  constraint product_prices_no_negativo check (centavos >= 0),
  constraint product_prices_tipo_valido check (tipo in ('normal', 'promocion'))
);

-- Dos promociones del mismo producto no pueden solaparse. Lo rechaza la BASE: no depende de
-- que la aplicación se acuerde. `haySolape` existe para poder avisar antes con un mensaje
-- entendible, no para sustituir a esto.
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
