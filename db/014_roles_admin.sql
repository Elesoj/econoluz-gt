-- El rol explícito del panel de administración.
--
-- Hoy `admin_users` no distingue nada: todo administrador autenticado puede hacer
-- cualquier cosa, porque `verificarSesionParaAccion()` solo comprueba que exista sesión.
-- Esta migración añade la columna `rol`, pero deliberadamente **no en una sola sentencia**
-- y **sin `default`**.
--
-- Un valor predeterminado de `administrador` convertiría cualquier `insert` que olvide la
-- columna en una elevación de privilegios silenciosa: la fila se crearía igual, sin error,
-- y con el rol más alto que existe. Por eso la columna nace nullable, se rellenan
-- explícitamente las filas existentes con el único rol que tiene sentido para ellas —hoy
-- todo administrador ya podía hacer todo, así que quedarse como `administrador` no cambia
-- su capacidad real— y solo entonces se cierra con `not null` y la restricción de valores.
-- Al terminar, la columna sigue sin `default`: cualquier `insert` que la omita falla en el
-- acto, en vez de colarse con el rol equivocado.
--
-- La restricción admite los dos valores, `administrador` y `empleado`. Habilitar el alta de
-- cuentas `empleado` es una decisión aparte —hace falta antes aplicar una matriz de
-- permisos a las acciones existentes de productos y proyectos, que hoy solo comprueban que
-- exista sesión— y por eso el cierre del camino de alta vive en
-- `scripts/create-admin.mjs`, no aquí: la base admite lo que el código de la aplicación
-- todavía no sabe repartir con seguridad.
--
-- Aditiva, transaccional y repetible como las anteriores: el migrador
-- (`scripts/migrate.mjs`) garantiza que este archivo no se ejecuta dos veces.
--
-- PRECONDICIÓN DE DESPLIEGUE, y no es opcional: `app/admin/auth/repository.ts` ya hace
-- `select … rol from admin_users` en el mismo commit que esta migración. Si el código
-- llega a un entorno donde esta migración todavía no está aplicada, esa consulta falla
-- con «column "rol" does not exist» y **nadie puede entrar al panel**: no se degrada, se
-- cae entero, porque `findActiveUserByEmail` es el primer paso de cualquier acceso.
--
-- Por eso esta migración tiene que aplicarse, con `npm run db:migrar`, en **cada rama de
-- Neon** —Producción y cualquier rama de desarrollo o de otro subproyecto— **antes** de
-- que el código que la acompaña llegue a esa rama. Una rama de Neon **no hereda** las
-- migraciones que se aplican después de haberla creado: es una copia congelada en el
-- momento de crearla, así que aplicar `014` en Producción no la aplica automáticamente en
-- una rama de desarrollo ya existente, ni al revés. Cada rama se comprueba y se migra por
-- separado.

-- Paso 1: la columna nace nullable, sin ninguna fila obligada a tener ya un valor.
alter table admin_users add column rol text;

-- Paso 2: las cuentas existentes quedan como administrador, de forma explícita y visible
-- en este archivo, nunca como efecto de un valor por defecto.
update admin_users
set rol = 'administrador'
where rol is null;

-- Paso 3: solo ahora, con la columna ya rellena, se cierra el hueco y se limitan sus
-- valores. Ningún `insert` posterior puede colarse sin decidir el rol.
alter table admin_users
  alter column rol set not null;

alter table admin_users
  add constraint admin_users_rol_valido
  check (rol in ('administrador', 'empleado'));
