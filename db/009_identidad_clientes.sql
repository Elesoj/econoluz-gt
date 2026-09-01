-- Identidad de clientes. Firebase guarda quién eres; esto, lo que es tuyo.
--
-- Estas tablas NO tienen nada que ver con `admin_users`: el panel es otro
-- sistema y no se relaciona con este por ninguna columna.

create table if not exists users (
  id                 bigserial   primary key,
  -- Identificador externo único, NUNCA clave primaria: si algún día Firebase
  -- se sustituye, cambia esta columna y no las claves foráneas del esquema.
  firebase_uid       text        not null unique,
  email              text        not null,
  email_verificado   boolean     not null default false,
  nombre             text        not null default '',
  telefono           text,
  nit                text,
  nombre_fiscal      text,
  estado             text        not null default 'activa',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_acceso_en   timestamptz,
  anonimizado_en     timestamptz,

  constraint users_estado_valido check (estado in ('activa', 'anonimizada')),
  constraint users_email_minusculas check (email = lower(btrim(email))),
  -- Ni anonimizada sin fecha, ni con fecha pero todavía activa.
  constraint users_anonimizada_tiene_fecha
    check ((estado = 'anonimizada') = (anonimizado_en is not null))
);

-- Un correo, una cuenta activa. Firebase ya lo promete, pero esa garantía vive
-- en un servicio ajeno y una configuración cambiada por descuido la desactiva
-- sin que nada se queje. Es parcial porque quien se da de baja debe poder
-- volver a registrarse con el mismo correo.
create unique index if not exists users_email_activo
  on users (email) where estado = 'activa';

create table if not exists user_addresses (
  id             bigserial   primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  destinatario   text        not null,
  telefono       text        not null,
  departamento   text        not null,
  municipio      text        not null,
  direccion      text        not null,
  -- En Guatemala buena parte de las entregas dependen de «portón negro frente
  -- a la tienda» más que del número de casa.
  referencias    text        not null default '',
  predeterminada boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Una sola predeterminada por cliente, garantizado por la base y no por el
-- código: es la clase de invariante que se olvida en cuanto hay dos caminos
-- de escritura.
create unique index if not exists user_addresses_una_predeterminada
  on user_addresses (user_id) where predeterminada;

create index if not exists user_addresses_user_id_idx on user_addresses (user_id);

create table if not exists user_consents (
  id           bigserial   primary key,
  user_id      bigint      not null references users(id) on delete cascade,
  tipo         text        not null,
  -- Los textos legales se versionan por fecha: '2026-09-01'.
  version      text        not null,
  aceptado_en  timestamptz not null default now(),
  revocado_en  timestamptz,

  constraint user_consents_tipo_valido
    check (tipo in ('terminos', 'privacidad', 'comunicaciones'))
);

create index if not exists user_consents_user_id_idx on user_consents (user_id, tipo);

create table if not exists auth_events (
  id             bigserial   primary key,
  -- A nulo al borrar la cuenta: el evento sigue siendo útil aunque ya no haya
  -- a quién atribuirlo, y mantenerlo enganchado sería conservar identidad.
  user_id        bigint      references users(id) on delete set null,
  tipo           text        not null,
  proveedor      text,
  resultado      text        not null,
  -- HMAC con pimienta secreta. NUNCA la IP en claro.
  ip_huella      text,
  -- La familia del navegador, no la cadena completa.
  navegador      text,
  ocurrido_en    timestamptz not null default now(),

  constraint auth_events_tipo_valido
    check (tipo in ('registro', 'acceso', 'vinculacion', 'borrado', 'fallo')),
  constraint auth_events_resultado_valido
    check (resultado in ('correcto', 'fallido'))
);

create index if not exists auth_events_ocurrido_en_idx on auth_events (ocurrido_en desc);
create index if not exists auth_events_huella_idx on auth_events (ip_huella, ocurrido_en desc);
