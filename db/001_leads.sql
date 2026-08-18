-- Tabla de solicitudes de asesoría (leads) del formulario de /catalogo.
-- Ejecutar una sola vez en la consola SQL de Neon antes del primer despliegue.
--
-- No la crea la aplicación en caliente a propósito: ejecutar DDL en cada
-- petición serverless es lento y propenso a carreras entre instancias.

create table if not exists leads (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),

  -- Campos obligatorios del formulario
  full_name       text        not null,
  phone           text        not null,
  email           text        not null,

  -- Campos opcionales del proyecto
  project_type    text,
  estimated_area  text,
  budget_range    text,
  lighting_type   text,
  message         text,

  -- Luminarias seleccionadas en el catálogo, como array de cadenas
  products        jsonb       not null default '[]'::jsonb,

  -- Resumen de la calculadora LED, si el usuario pasó por ella
  led_summary     text,

  -- Contexto de origen para diagnosticar la entrega por WhatsApp
  source          text,
  user_agent      text
);

-- El caso de consulta habitual es "los leads más recientes".
create index if not exists leads_created_at_idx on leads (created_at desc);

-- Ayuda a detectar duplicados cuando alguien envía el formulario dos veces.
create index if not exists leads_email_idx on leads (lower(email));
