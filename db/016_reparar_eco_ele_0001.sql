-- Reparación idempotente de ECO-ELE-0001 (APL-001)
--
-- Restaura las especificaciones técnicas perdidas por la edición previa en el panel:
-- 1. Convierte lifespan -> lifetime ("40000").
-- 2. Restaura amperage ("15A") y frequency ("50/60Hz").
-- 3. Conserva warranty ("5 años") en products.technical_specs.
-- 4. Actualiza la proyección en public_products garantizando que warranty y datos
--    de proveedor no crucen a la vista pública.
--
-- Idempotente: ejecutarlo varias veces deja el mismo estado exacto.

do $$
declare
  v_specs jsonb;
  v_prod record;
begin
  select * into v_prod from products where econoluz_reference = 'ECO-ELE-0001';

  if found then
    v_specs := coalesce(v_prod.technical_specs, '{}'::jsonb);

    -- Migrar lifespan a lifetime si existe
    if v_specs ? 'lifespan' and not (v_specs ? 'lifetime') then
      v_specs := v_specs || jsonb_build_object('lifetime', v_specs->>'lifespan');
    end if;
    v_specs := v_specs - 'lifespan';

    -- Asegurar lifetime si no estaba
    if not (v_specs ? 'lifetime') or v_specs->>'lifetime' = '' then
      v_specs := v_specs || '{"lifetime": "40000"}'::jsonb;
    end if;

    -- Restaurar amperage y frequency
    v_specs := v_specs || '{"amperage": "15A", "frequency": "50/60Hz"}'::jsonb;

    -- Conservar o asegurar warranty de 5 años
    if not (v_specs ? 'warranty') or v_specs->>'warranty' = '' then
      v_specs := v_specs || '{"warranty": "5 años"}'::jsonb;
    end if;

    update products
    set technical_specs = v_specs,
        updated_at = now()
    where econoluz_reference = 'ECO-ELE-0001';

    -- Actualizar public_products si está publicado
    -- Nota: la proyección pública excluye warranty (no está en el contrato público)
    -- y no contiene columnas de proveedor.
    if v_prod.published then
      update public_products
      set technical_specs = (v_specs - 'warranty'),
          updated_at = now()
      where econoluz_reference = 'ECO-ELE-0001';
    end if;
  end if;
end $$;
