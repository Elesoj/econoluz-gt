-- Rol de lectura pública. Solo puede leer la proyección `public_products`.
--
-- ESTA MIGRACIÓN NO CONTIENE NINGUNA CONTRASEÑA, y no debe contenerla nunca:
-- la credencial se genera fuera del repositorio y se guarda como secreto en
-- Neon y en Vercel. El procedimiento está en docs/OPERACION-ROL-PUBLICO.md.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'econoluz_publico') then
    create role econoluz_publico nologin;
  end if;
end
$$;

revoke all on all tables in schema public from econoluz_publico;
revoke all on all sequences in schema public from econoluz_publico;
revoke all on schema public from econoluz_publico;

grant usage on schema public to econoluz_publico;
grant select on public_products to econoluz_publico;

-- Que una tabla futura no herede permisos por descuido.
alter default privileges in schema public revoke all on tables from econoluz_publico;
