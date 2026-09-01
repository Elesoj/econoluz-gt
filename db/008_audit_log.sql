-- Quién cambió qué, con el antes y el después.
--
-- Nace en este subproyecto porque los siguientes escribirán aquí, y una tabla
-- de auditoría que aparece después de los cambios que debía registrar no sirve
-- de nada. De momento no la escribe nadie.
--
-- `antes` y `despues` son `jsonb` para no atarse a la forma de cada entidad:
-- lo que se audita hoy es un producto, y mañana un pedido o una dirección.
--
-- El rol de lectura pública no recibe ningún permiso sobre esta tabla; vale la
-- misma explicación que en `007_app_settings.sql`.

create table if not exists audit_log (
  id          bigserial   primary key,
  ocurrido_en timestamptz not null default now(),
  actor_tipo  text        not null,
  actor_id    text,
  accion      text        not null,
  entidad     text        not null,
  entidad_id  text,
  antes       jsonb,
  despues     jsonb,

  -- Tres orígenes posibles y ninguno más: una persona del panel, el propio
  -- sistema o un cliente de la tienda. Un cuarto valor sería un error de
  -- programación, y es mejor que salte al escribir que descubrirlo al leer.
  constraint audit_log_actor_tipo_valido
    check (actor_tipo in ('admin', 'sistema', 'cliente'))
);

-- Las dos formas previstas de consultar: lo último que pasó, y todo lo que le
-- pasó a una entidad concreta.
create index if not exists audit_log_ocurrido_en_idx on audit_log (ocurrido_en desc);
create index if not exists audit_log_entidad_idx on audit_log (entidad, entidad_id);
