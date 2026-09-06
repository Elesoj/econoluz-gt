-- Reparación idempotente de ECO-ELE-0001 (APL-001)
--
-- Restaura las especificaciones técnicas perdidas por la edición previa en el panel:
-- 1. Normaliza lifetime:
--    - Si lifetime ya existe y no está vacío, tiene prioridad.
--    - Si falta lifetime y existe lifespan no vacío, copia lifespan a lifetime.
--    - Si ambas faltan o están vacías, utiliza "40000".
--    - Elimina lifespan al finalizar.
-- 2. Conserva o restaura warranty:
--    - Si warranty ya existe y no está vacía, consérvala; si falta o está vacía, "5 años".
--    - warranty permanece exclusivamente en products.
-- 3. Conserva o restaura amperage:
--    - Si amperage ya existe y no está vacío, consérvalo; si falta o está vacío, "15A".
-- 4. Conserva o restaura frequency:
--    - Si frequency ya existe y no está vacía, consérvala; si falta o está vacía, "50/60Hz".
-- 5. Actualiza public_products sin copiar el JSON interno completo:
--    - Conserva las especificaciones públicas existentes (v_pub_specs).
--    - Actualiza únicamente las 3 claves públicas autorizadas: lifetime, amperage, frequency.
--    - Elimina explícitamente warranty y lifespan si apareciesen.
--    - No copia ninguna otra clave desde products.
--
-- Idempotente: ejecutarlo varias veces deja el mismo estado exacto.

do $$
declare
  v_specs jsonb;
  v_pub_specs jsonb;
  v_prod record;
  v_pub_prod record;
  v_lifetime text;
  v_amperage text;
  v_frequency text;
begin
  select * into v_prod from products where econoluz_reference = 'ECO-ELE-0001';

  if found then
    v_specs := coalesce(v_prod.technical_specs, '{}'::jsonb);

    -- 1. Regla de lifetime y lifespan:
    -- Si lifetime ya existe y no está vacío, tiene prioridad.
    -- Si falta lifetime y existe lifespan no vacío, copia lifespan a lifetime.
    -- Si ambas faltan o están vacías, utiliza "40000".
    if v_specs ? 'lifetime' and coalesce(trim(v_specs->>'lifetime'), '') <> '' then
      v_lifetime := trim(v_specs->>'lifetime');
    elsif v_specs ? 'lifespan' and coalesce(trim(v_specs->>'lifespan'), '') <> '' then
      v_lifetime := trim(v_specs->>'lifespan');
    else
      v_lifetime := '40000';
    end if;

    v_specs := v_specs || jsonb_build_object('lifetime', v_lifetime);
    v_specs := v_specs - 'lifespan';

    -- 2. Regla de warranty:
    -- Si warranty ya existe y no está vacía, consérvala; si falta o está vacía, "5 años".
    if not (v_specs ? 'warranty') or coalesce(trim(v_specs->>'warranty'), '') = '' then
      v_specs := v_specs || jsonb_build_object('warranty', '5 años');
    end if;

    -- 3. Regla de amperage:
    -- Si amperage ya existe y no está vacío, consérvalo; si falta o está vacío, "15A".
    if v_specs ? 'amperage' and coalesce(trim(v_specs->>'amperage'), '') <> '' then
      v_amperage := trim(v_specs->>'amperage');
    else
      v_amperage := '15A';
      v_specs := v_specs || jsonb_build_object('amperage', v_amperage);
    end if;

    -- 4. Regla de frequency:
    -- Si frequency ya existe y no está vacía, consérvala; si falta o está vacía, "50/60Hz".
    if v_specs ? 'frequency' and coalesce(trim(v_specs->>'frequency'), '') <> '' then
      v_frequency := trim(v_specs->>'frequency');
    else
      v_frequency := '50/60Hz';
      v_specs := v_specs || jsonb_build_object('frequency', v_frequency);
    end if;

    update products
    set technical_specs = v_specs,
        updated_at = now()
    where econoluz_reference = 'ECO-ELE-0001';

    -- 5. Actualización pública segura (sin copiar el JSON interno completo):
    if v_prod.published then
      select * into v_pub_prod from public_products where econoluz_reference = 'ECO-ELE-0001';
      if found then
        v_pub_specs := coalesce(v_pub_prod.technical_specs, '{}'::jsonb);

        -- Limpieza preventiva de campos que nunca deben ser públicos
        v_pub_specs := v_pub_specs - 'warranty' - 'lifespan';

        -- Actualización exclusiva de las tres claves públicas autorizadas
        v_pub_specs := v_pub_specs || jsonb_build_object(
          'lifetime', v_lifetime,
          'amperage', v_amperage,
          'frequency', v_frequency
        );

        update public_products
        set technical_specs = v_pub_specs,
            updated_at = now()
        where econoluz_reference = 'ECO-ELE-0001';
      end if;
    end if;
  end if;
end $$;
