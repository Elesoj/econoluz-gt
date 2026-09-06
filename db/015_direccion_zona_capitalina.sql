-- Zona capitalina en las direcciones del cliente, y siembra de la configuración
-- operativa de envíos.
--
-- El mensajero propio solo entra en el municipio de Guatemala, y allí lo que
-- decide quién reparte es la zona. Por eso la zona deja de ser texto libre dentro
-- de `direccion` y pasa a ser una columna con dominio cerrado.
--
-- La columna admite NULL a propósito: las direcciones que ya existen no tienen
-- zona y no se pueden invalidar hacia atrás. Que sea obligatoria al dar de alta
-- una dirección capitalina lo impone la aplicación, en `validarDireccion`.
--
-- Lo que sí impone la base es la coherencia: no puede haber zona si el destino no
-- es el municipio de Guatemala, y la zona tiene que ser una de las 22 reales.

alter table user_addresses
  add column if not exists zona_capitalina smallint null;

-- Las zonas 20, 22 y 23 no existen en la ciudad.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_addresses_zona_capitalina_valida_check'
  ) then
    alter table user_addresses
      add constraint user_addresses_zona_capitalina_valida_check
      check (
        zona_capitalina is null or
        zona_capitalina in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25)
      );
  end if;
end $$;

-- Zona solo si el destino es el municipio de Guatemala (departamento 01,
-- municipio 0101). Una dirección de Mixco con «zona 4» sería una zona de otra
-- ciudad, y el cálculo del envío la tomaría por capitalina.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_addresses_zona_capitalina_municipio_check'
  ) then
    alter table user_addresses
      add constraint user_addresses_zona_capitalina_municipio_check
      check (
        zona_capitalina is null or (departamento_codigo = '01' and municipio_codigo = '0101')
      );
  end if;
end $$;

-- Configuración operativa inicial.
--
-- Se guarda como texto plano y no con conversión a jsonb porque `app_settings.valor`
-- es `text` y porque la escritura la bloquea después con `select ... for update`:
-- la fila tiene que existir para poder bloquearla.
--
-- `on conflict do nothing` mantiene la migración repetible sin pisar un valor que
-- el panel haya cambiado después a propósito.
insert into app_settings (clave, valor, actualizado_en, actualizado_por)
values (
  'envios_zonas_metodos',
  '{"1":"mensajero_propio","2":"mensajero_propio","3":"mensajero_propio","4":"mensajero_propio","5":"mensajero_propio","6":"guatex","7":"mensajero_propio","8":"mensajero_propio","9":"mensajero_propio","10":"mensajero_propio","11":"mensajero_propio","12":"mensajero_propio","13":"mensajero_propio","14":"mensajero_propio","15":"mensajero_propio","16":"mensajero_propio","17":"guatex","18":"guatex","19":"mensajero_propio","21":"mensajero_propio","24":"mensajero_propio","25":"mensajero_propio"}',
  now(),
  'sistema:migracion_015'
)
on conflict (clave) do nothing;

-- Q35,00 de tarifa fija y gratuidad a partir de Q2.500,00 inclusive, en centavos
-- enteros. Ambos editables desde /admin/envios.
insert into app_settings (clave, valor, actualizado_en, actualizado_por)
values (
  'envios_reglas_propias',
  '{"tarifaCents":3500,"umbralGratisCents":250000}',
  now(),
  'sistema:migracion_015'
)
on conflict (clave) do nothing;
