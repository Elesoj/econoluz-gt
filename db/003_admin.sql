-- Usuarios, sesiones revocables e intentos de acceso del panel administrativo.
-- La aplicación nunca guarda el token de sesión ni la clave de intentos en claro.

create table if not exists admin_users (
  id              bigserial primary key,
  email           text        not null unique,
  password_hash   text        not null,
  salt            text        not null,
  name            text        not null,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  active          boolean     not null default true,

  constraint admin_users_email_minusculas check (email = lower(btrim(email)))
);

create table if not exists admin_sessions (
  token_hash      text        primary key,
  user_id         bigint      not null references admin_users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);

create table if not exists admin_login_attempts (
  key_hash          text        primary key,
  failure_count     integer     not null default 0,
  window_started_at timestamptz not null,
  blocked_until     timestamptz,
  updated_at        timestamptz not null default now(),

  constraint admin_login_attempts_failure_count_no_negativo check (failure_count >= 0)
);

create index if not exists admin_sessions_user_id_idx on admin_sessions (user_id);
create index if not exists admin_sessions_expires_at_idx on admin_sessions (expires_at);
create index if not exists admin_login_attempts_updated_at_idx on admin_login_attempts (updated_at);
