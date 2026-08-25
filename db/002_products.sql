-- Catálogo de productos en base de datos.
-- Ejecutar una sola vez en la consola SQL de Neon, después de db/001_leads.sql.
--
-- Hasta ahora los 313 productos vivían escritos dentro de app/data/products.ts,
-- así que cada alta o corrección obligaba a editar código y volver a desplegar.
-- Esta tabla los saca de ahí para que se administren desde el panel.
--
-- Igual que la tabla de leads, la aplicación no crea el esquema en caliente:
-- ejecutar DDL en cada petición serverless es lento y provoca carreras entre
-- instancias.

create table if not exists products (
  -- Identificador interno heredado del catálogo original (por ejemplo
  -- "construlita-cuasar"). Es estable y no se enseña nunca al cliente.
  id                     text        primary key,

  -- Identidad pública y permanente (ECO-CAT-0132). Es lo que el cliente cita
  -- al pedir cotización, así que no cambia aunque el producto se renombre.
  econoluz_reference     text        not null unique,

  -- Orden en el catálogo. La numeración deja huecos a propósito (10, 20, 30…)
  -- para poder intercalar un producto sin renumerar la tabla entera.
  position               integer     not null,

  -- ---------------------------------------------------------------------
  -- Lo que ve el cliente
  -- ---------------------------------------------------------------------
  public_name            text        not null,
  public_description     text        not null default '',
  image                  text        not null,

  -- Galería adicional. `null` significa que el producto solo tiene la imagen
  -- principal; no es lo mismo que una galería vacía.
  images                 jsonb,

  -- Ficha técnica ya saneada, sin códigos ni marcas del proveedor. Es jsonb y
  -- no columnas porque hay 57 tipos de dato técnico distintos y casi ningún
  -- producto los tiene todos. Los valores son texto o lista de textos.
  technical_specs        jsonb,

  -- ---------------------------------------------------------------------
  -- Taxonomía pública (los identificadores viven en app/data/catalogTaxonomy.ts)
  -- Las etiquetas se guardan además del identificador porque algunas no se
  -- pueden reconstruir: cuando la taxonomía no conoce un valor, el catálogo
  -- conserva el texto original en lugar de inventarse uno.
  -- ---------------------------------------------------------------------
  product_type           text        not null,
  product_type_label     text        not null,
  application            text        not null,
  application_label      text        not null,
  finish                 text        not null default '',
  finish_label           text        not null default '',
  family_label           text        not null default '',

  -- ---------------------------------------------------------------------
  -- Datos del proveedor — NUNCA salen al navegador.
  -- Son la razón de que el catálogo público no permita identificar al
  -- fabricante. Se guardan porque la empresa los necesita para comprar, pero
  -- la capa pública (app/data/publicProduct.ts) no los deja pasar.
  -- ---------------------------------------------------------------------
  supplier_brand         text        not null default '',
  supplier_brand_label   text        not null default '',
  supplier_series        text        not null default '',
  supplier_series_label  text        not null default '',
  supplier_code          text        not null default '',
  supplier_name          text        not null default '',
  supplier_description   text        not null default '',

  -- ---------------------------------------------------------------------
  -- Tienda. Las columnas existen desde ya, aunque la tienda todavía no,
  -- para poder ir cargando precios desde el panel mientras se construye:
  -- ponerle precio a 313 productos es la tarea más lenta del proyecto y no
  -- depende de programar. Nada de esto se muestra hasta que exista la tienda.
  -- ---------------------------------------------------------------------
  price_gtq              numeric(10, 2),
  stock                  integer,
  sellable_online        boolean     not null default false,

  -- Un producto sin publicar se puede preparar con calma sin que aparezca.
  published              boolean     not null default true,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint products_price_no_negativo check (price_gtq is null or price_gtq >= 0),
  constraint products_stock_no_negativo check (stock is null or stock >= 0)
);

-- El catálogo se lee entero y en orden, que es la consulta de siempre.
create index if not exists products_position_idx on products (position);

-- Filtrar por tipo y aplicación es lo que hace el catálogo guiado.
create index if not exists products_product_type_idx on products (product_type);
create index if not exists products_application_idx on products (application);

-- Buscar por referencia ECONOLUZ sin distinguir mayúsculas.
create index if not exists products_reference_idx on products (lower(econoluz_reference));

-- Las referencias nuevas continúan la numeración del catálogo original, que
-- llega hasta 0313. El prefijo (ELE, IND, CAT, TUB) lo decide el tipo de
-- producto y lo pone la aplicación; este contador solo da el número.
create sequence if not exists econoluz_reference_seq start with 314;

-- `updated_at` se mantiene solo, para no depender de que la aplicación se
-- acuerde de actualizarlo en cada camino de edición.
create or replace function products_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_touch_updated_at on products;
create trigger products_touch_updated_at
  before update on products
  for each row
  execute function products_touch_updated_at();
