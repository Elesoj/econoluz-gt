-- Proyección pública del catálogo: tabla derivada y sincronizada, NO fuente de
-- verdad. Su contenido se reconstruye entero desde `products` en cualquier
-- momento con `npm run catalogo:reproyectar`; si se borrara, no se perdería nada.
--
-- No es una MATERIALIZED VIEW: la mantiene la aplicación, no el planificador.
--
-- Existe porque el rol de lectura pública necesita una superficie segura que
-- leer. La limpieza de privacidad necesita los datos del proveedor como
-- contexto, así que se ejecuta al escribir, no al leer, y aquí solo entra el
-- resultado ya saneado.

create table if not exists public_products (
  -- Identificador público: la referencia en minúsculas.
  id                 text        primary key,
  econoluz_reference text        not null unique,
  position           integer     not null,

  public_name        text        not null,
  public_description text        not null default '',
  image              text        not null,
  images             jsonb,

  product_type       text        not null,
  application        text        not null,
  finish             text        not null default '',
  label_product_type text        not null,
  label_application  text        not null,
  label_finish       text        not null default '',

  technical_specs    jsonb,

  -- Centavos enteros, nunca decimales. `null` es «todavía sin precio»: el
  -- producto se enseña pero no se compra, y la tarjeta ofrece consultar.
  -- Cero no es un precio: significaría regalar el producto, así que la
  -- restricción de abajo lo rechaza igual que a los negativos.
  price_cents        integer,

  updated_at         timestamptz not null default now(),

  constraint public_products_price_cents_comprable
    check (price_cents is null or price_cents > 0)
);

create index if not exists public_products_position_idx on public_products (position);
create index if not exists public_products_application_idx on public_products (application);
