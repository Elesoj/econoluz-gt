-- Envíos 9A: zonas de reparto, su cobertura geográfica y sus tarifas.
--
-- Es el corazón del subsistema de envíos, y por eso **los invariantes del modelo se
-- imponen aquí, en el esquema, no en el código de la aplicación**. Una regla escrita solo
-- en TypeScript se salta con un script, con una consola de Postgres o con el próximo
-- camino que alguien añada sin acordarse de ella; una restricción de la base no.
--
-- Las tres tablas nacen **vacías y se quedan vacías**: ninguna zona, ninguna cobertura y
-- ninguna tarifa se siembran. Los importes los carga el dueño desde `/admin` (decisiones 6
-- y 9 del diseño). Una tarifa inventada para que el sistema «parezca completo» es peor que
-- no tener tarifa: sin tarifa el checkout deriva a la asesoría, con una tarifa falsa cobra
-- mal y nadie se entera.
--
-- Depende de `012_geografia_gt.sql`, que trae `geo_departamentos` y `geo_municipios`, y de
-- `010_catalogo_relacional.sql`, que ya instaló `btree_gist`: el `exclude using gist` de
-- más abajo no crea ninguna extensión.
--
-- **Esta migración no rellena las direcciones existentes.** Añade a `user_addresses` las
-- dos columnas de código, la clave foránea compuesta y su `check`, y nada más. El
-- emparejamiento de los textos históricos con la geografía oficial es TypeScript y llega
-- en una tarea posterior; una migración SQL no puede invocarlo.
--
-- Aditiva, transaccional y repetible, como las doce anteriores. El archivo no necesita
-- poder ejecutarse dos veces por sí solo: eso lo garantiza el migrador
-- (`scripts/migrate.mjs`) a través de `schema_migrations`.

-- ---------------------------------------------------------------------------
-- §4.3  Las direcciones ganan códigos sin perder su texto
-- ---------------------------------------------------------------------------

alter table user_addresses
  add column if not exists departamento_codigo char(2) references geo_departamentos(codigo),
  add column if not exists municipio_codigo     char(4) references geo_municipios(codigo);

-- Dos claves foráneas sueltas solo prueban que cada código existe, **no que el municipio
-- sea de ese departamento**; la compuesta sí. Es `match simple`, de modo que una dirección
-- a medio resolver —los dos códigos nulos— sigue siendo legal, y el `check` cierra el
-- único hueco que eso deja: un municipio sin su departamento.
alter table user_addresses
  add constraint user_addresses_municipio_del_departamento
    foreign key (municipio_codigo, departamento_codigo)
    references geo_municipios (codigo, departamento_codigo),
  add constraint user_addresses_municipio_exige_departamento
    check (municipio_codigo is null or departamento_codigo is not null);

-- ---------------------------------------------------------------------------
-- §4.4  `shipping_zones` — solo zonas geográficas
-- ---------------------------------------------------------------------------

create table if not exists shipping_zones (
  id             bigserial   primary key,
  -- El identificador estable con el que habla el resto del sistema. No se cambia una vez
  -- creada la zona: un slug editable convierte cualquier referencia guardada en una
  -- referencia rota silenciosa.
  codigo         text        not null unique,
  nombre         text        not null,
  -- ECONOLUZ reparte con mensajero propio dentro del departamento de Guatemala y con
  -- paquetería en los otros 21. Son métodos distintos, no una etiqueta cosmética.
  metodo         text        not null,
  -- Nace en `false` a propósito: una zona sin tarifa cargada no debe resolver nada. Que
  -- exista la zona no significa que ya se entregue ahí.
  activa         boolean     not null default false,
  notas          text        not null default '',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint shipping_zones_metodo_valido
    check (metodo in ('mensajero_propio', 'paqueteria'))
);

-- ---------------------------------------------------------------------------
-- §4.5  Cobertura, con claves foráneas reales
-- ---------------------------------------------------------------------------

create table if not exists shipping_zone_areas (
  id                  bigserial   primary key,
  -- `restrict`, no `cascade`: ver la nota de §4.8 más abajo.
  zone_id             bigint      not null references shipping_zones(id) on delete restrict,
  -- Un `check` con expresión regular validaría la forma del código pero **no que el
  -- destino exista**: un código bien formado e inexistente entraría sin protesta. Por eso
  -- dos columnas nullable con clave foránea real.
  departamento_codigo char(2)     references geo_departamentos(codigo),
  municipio_codigo    char(4)     references geo_municipios(codigo),
  -- Inactiva significa «aquí no entregamos», que no es lo mismo que «aquí aplica la regla
  -- general del departamento»: ver la precedencia de §4.6.
  activa              boolean     not null default true,
  creado_en           timestamptz not null default now(),

  -- Exactamente un ámbito informado. Una fila con los dos, o con ninguno, no dice a qué
  -- sitio se refiere.
  constraint shipping_zone_areas_un_solo_ambito
    check (num_nonnulls(departamento_codigo, municipio_codigo) = 1)
);

-- Unicidad parcial por nivel: como máximo una zona reclama cada departamento y como máximo
-- una reclama cada municipio. **No hay columna de prioridad, y es deliberado**: una
-- prioridad editable es donde se cuelan dos zonas empatadas reclamando el mismo sitio y un
-- `order by` que desempata como le apetece. La precedencia es la especificidad, fija y no
-- configurable (§4.6): primero el municipio, y solo si ningún registro lo reclama, el
-- departamento.
create unique index if not exists shipping_zone_areas_departamento_unico
  on shipping_zone_areas (departamento_codigo) where departamento_codigo is not null;

create unique index if not exists shipping_zone_areas_municipio_unico
  on shipping_zone_areas (municipio_codigo) where municipio_codigo is not null;

-- ---------------------------------------------------------------------------
-- §4.7  `shipping_rates`
-- ---------------------------------------------------------------------------

create table if not exists shipping_rates (
  id                  bigserial   primary key,
  -- `restrict`, no `cascade`: ver la nota de §4.8 más abajo.
  zone_id             bigint      not null references shipping_zones(id) on delete restrict,
  -- Todo importe en centavos enteros, nunca `numeric` ni coma flotante.
  importe_cents       integer     not null,
  umbral_gratis_cents integer,
  -- Los dos límites del pedido «grande» (decisión 5): lo que se alcance primero manda, y
  -- por encima de cualquiera de ellos el pedido se cotiza aparte.
  max_piezas          integer,
  max_importe_cents   integer,
  -- 2 y 3 días hábiles es el dato que dio el dueño (decisión 11). No es un importe: la
  -- prohibición de valores comerciales predeterminados cubre el dinero, no los plazos.
  plazo_min_dias      smallint    not null default 2,
  plazo_max_dias      smallint    not null default 3,
  publicada           boolean     not null default false,
  vigente_desde       timestamptz not null default now(),
  vigente_hasta       timestamptz,
  -- El periodo se deriva, no se escribe: dos columnas y un rango que hubiera que mantener
  -- a mano acabarían discrepando.
  periodo tstzrange generated always as
    (tstzrange(vigente_desde, vigente_hasta, '[)')) stored,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint shipping_rates_importe_valido      check (importe_cents >= 0),
  constraint shipping_rates_umbral_valido       check (umbral_gratis_cents is null or umbral_gratis_cents > 0),
  constraint shipping_rates_max_piezas_valido   check (max_piezas is null or max_piezas > 0),
  constraint shipping_rates_max_importe_valido  check (max_importe_cents is null or max_importe_cents > 0),
  constraint shipping_rates_plazo_valido        check (plazo_min_dias >= 0 and plazo_max_dias >= plazo_min_dias),
  constraint shipping_rates_vigencia_valida     check (vigente_hasta is null or vigente_hasta > vigente_desde),

  -- Una sola tarifa publicada vigente por zona, garantizado por la base. Es **parcial**:
  -- solo alcanza a las publicadas, así que caben borradores sin publicar sin estorbarse.
  -- `btree_gist` ya está instalada desde la migración `010`.
  --
  -- **No sirve para programar tarifas futuras**; ver §4.8.1 y el disparador de más abajo.
  constraint shipping_rates_sin_solape_vigencia
    exclude using gist (zone_id with =, periodo with &&) where (publicada)
);

-- `umbral_gratis_cents` no se valida contra `importe_cents` a propósito: son magnitudes
-- distintas —un subtotal de pedido frente a un coste de envío— y compararlas no significa
-- nada. Cobrar Q35 y regalar el envío desde Q20 puede ser una promoción deliberada. El
-- panel advierte, no bloquea (§6.5).

create index if not exists shipping_rates_zone_id_idx on shipping_rates (zone_id);

-- ---------------------------------------------------------------------------
-- §4.8 y §4.8.1  Lo publicado no se reescribe, no se programa y no se borra
-- ---------------------------------------------------------------------------
--
-- Las dos claves foráneas hacia `shipping_zones` son `on delete restrict`, tanto la de la
-- cobertura como la de las tarifas. **No hay borrado en cascada**: eliminar una zona nunca
-- puede llevarse por delante en silencio el reparto del país. Una zona con cobertura o con
-- tarifas —publicadas o no— no se borra: se desactiva.
--
-- Es el mismo patrón que `product_prices`, y responde a una necesidad concreta: un pedido
-- antiguo tiene que poder explicar con qué configuración se calculó.

-- Impide reescribir una tarifa publicada. La única modificación permitida es
-- cerrar vigente_hasta una vez, de null a una fecha, durante la sustitución.
create or replace function shipping_rates_inmutable() returns trigger as $$
begin
  if old.publicada then
    if new.importe_cents is distinct from old.importe_cents
       or new.umbral_gratis_cents is distinct from old.umbral_gratis_cents
       or new.max_piezas is distinct from old.max_piezas
       or new.max_importe_cents is distinct from old.max_importe_cents
       or new.plazo_min_dias is distinct from old.plazo_min_dias
       or new.plazo_max_dias is distinct from old.plazo_max_dias
       or new.zone_id is distinct from old.zone_id
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'Una tarifa publicada no cambia sus campos economicos';
    end if;
    if not new.publicada then
      raise exception 'Una tarifa publicada no se despublica';
    end if;
    if old.vigente_hasta is not null and new.vigente_hasta is distinct from old.vigente_hasta then
      raise exception 'La vigencia de una tarifa publicada se cierra una sola vez';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger shipping_rates_no_reescribir
  before update on shipping_rates
  for each row execute function shipping_rates_inmutable();

-- Sin programación futura: una tarifa se publica abierta y en el momento.
create or replace function shipping_rates_sin_programar() returns trigger as $$
begin
  if new.publicada then
    if new.vigente_hasta is not null then
      raise exception 'Una tarifa se publica abierta, sin fecha de fin';
    end if;
    if new.vigente_desde > now() then
      raise exception 'Una tarifa se publica en el momento, no con fecha futura';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger shipping_rates_no_programar
  before insert on shipping_rates
  for each row execute function shipping_rates_sin_programar();

-- Borrar una tarifa publicada no está permitido; se sustituye.
create or replace function shipping_rates_no_borrar() returns trigger as $$
begin
  if old.publicada then
    raise exception 'Una tarifa publicada no se borra';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger shipping_rates_borrado_restringido
  before delete on shipping_rates
  for each row execute function shipping_rates_no_borrar();

-- ---------------------------------------------------------------------------
-- §7.3  El rol público no ve nada de esto
-- ---------------------------------------------------------------------------
--
-- Las zonas, su cobertura y sus tarifas se leen desde el servidor con la conexión de
-- aplicación, nunca desde el navegador: el importe de envío lo calcula el servidor, igual
-- que los precios. Además, `notas` y los límites de cotización son configuración interna.
--
-- Se revoca de forma explícita en vez de confiar en no haber concedido nada: una concesión
-- futura por descuido —un `grant select on all tables`— pasaría inadvertida, y así al
-- menos queda escrito de quién es esta puerta y que está cerrada. Las secuencias van
-- nombradas una a una por el mismo motivo.
revoke all on shipping_zones from econoluz_publico;
revoke all on shipping_zone_areas from econoluz_publico;
revoke all on shipping_rates from econoluz_publico;
revoke all on sequence shipping_zones_id_seq from econoluz_publico;
revoke all on sequence shipping_zone_areas_id_seq from econoluz_publico;
revoke all on sequence shipping_rates_id_seq from econoluz_publico;
