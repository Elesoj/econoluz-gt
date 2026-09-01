-- Configuración persistente y protegida.
--
-- Vive en la base y no en una variable de entorno porque cambiar una variable
-- en Vercel exige normalmente un nuevo despliegue, y entonces no sirve como
-- vuelta atrás inmediata.
--
-- Es una tabla de clave y valor a propósito: la validación de lo que significa
-- cada clave vive en el código, que ante un valor desconocido se queda con el
-- camino probado en lugar de fallar. Ver `app/lib/ajustes.ts`.
--
-- El rol de lectura pública no recibe ningún permiso sobre esta tabla. Como
-- `006_rol_publico.sql` se aplica antes y le revocó todo, una tabla creada
-- después nace sin privilegios para él; `npm run test:permisos` lo comprueba.

-- Aviso para quien escriba el primer actualizador: `actualizado_en` y
-- `actualizado_por` solo tienen valor por defecto al insertar. Un `update` que
-- cambie `valor` y no los toque dejaría la fecha de cuando nació la fila, que
-- es peor que no tener fecha porque parece cierta. No se pone un disparador
-- porque todavía no escribe nadie y una regla oculta sorprende más que una
-- columna en el `update`.

create table if not exists app_settings (
  clave           text        primary key,
  valor           text        not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text        not null default 'sistema'
);

-- El selector del modelo de catálogo nace en `legacy` y ahí se queda al
-- terminar este subproyecto. `relational_v2` es del subproyecto 3 y necesita
-- autorización expresa del dueño.
--
-- `on conflict do nothing` mantiene la migración repetible sin pisar un valor
-- que alguien haya cambiado después a propósito.
insert into app_settings (clave, valor)
values ('modelo_catalogo', 'legacy')
on conflict (clave) do nothing;
