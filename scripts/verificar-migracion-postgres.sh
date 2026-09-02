#!/usr/bin/env bash
#
# Comprueba `db/010_catalogo_relacional.sql` contra un PostgreSQL de verdad.
#
# Las pruebas de `tests/catalogo-migracion.test.ts` leen el texto del archivo: sirven para
# que nadie borre una restricción sin enterarse, pero no demuestran que PostgreSQL acepte la
# migración ni que las restricciones se comporten como dicen. Esto sí.
#
# Levanta un clúster EFÍMERO propio, sin Docker, sin `sudo` y **sin red**: escucha solo en un
# socket dentro de su carpeta temporal. No toca ninguna base de datos del proyecto, no usa
# contraseñas y borra todo al terminar, incluso si algo falla.
#
# Uso, desde WSL o cualquier Linux con PostgreSQL instalado:
#   bash scripts/verificar-migracion-postgres.sh
#
# NO forma parte de la Fase B: no aplica nada en Neon.

set -euo pipefail

NOMBRE=econoluz-catalogo-fase-a-test
BASE="${TMPDIR:-/tmp}/$NOMBRE"
PUERTO=55432
ROL=econoluz_app
BD=econoluz_fase_a

BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fallos=0
comprobaciones=0

limpiar() {
  if [ -d "$BASE/data" ]; then
    "$BIN/pg_ctl" -D "$BASE/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  # Solo la carpeta efímera de esta prueba, nunca una ruta heredada.
  case "$BASE" in
    */"$NOMBRE") rm -rf "$BASE" ;;
    *) echo "AVISO: no borro '$BASE' porque no termina en $NOMBRE" ;;
  esac
}
trap limpiar EXIT

psql_app() { "$BIN/psql" -h "$BASE/sock" -p "$PUERTO" -U "$ROL" -d "$BD" -v ON_ERROR_STOP=1 -q "$@"; }

# `descripcion` + SQL que debe confirmarse sin error.
debe_pasar() {
  comprobaciones=$((comprobaciones + 1))
  if psql_app -c "$2" >/dev/null 2>"$BASE/ultimo-error.txt"; then
    echo "  ok       $1"
  else
    echo "  FALLA    $1"
    sed 's/^/             /' "$BASE/ultimo-error.txt" | head -3
    fallos=$((fallos + 1))
  fi
}

# `descripcion` + SQL que la base TIENE que rechazar + qué restricción debe saltar.
#
# El tercer argumento no es un adorno: sin él, una errata en el SQL de la prueba también
# produce un error y la comprobación se daría por buena sin haber ejercitado nada. Exigir el
# nombre de la restricción es lo que distingue «lo rechazó por lo que yo creo» de «falló».
debe_fallar() {
  comprobaciones=$((comprobaciones + 1))
  if [ -z "${3:-}" ]; then
    echo "  FALLA    $1  <-- prueba mal escrita: falta la restricción esperada"
    fallos=$((fallos + 1))
    return
  fi
  if psql_app -c "$2" >/dev/null 2>"$BASE/ultimo-error.txt"; then
    echo "  FALLA    $1  <-- la base lo aceptó y no debía"
    fallos=$((fallos + 1))
  elif grep -qi -- "$3" "$BASE/ultimo-error.txt"; then
    echo "  ok       $1"
  else
    echo "  FALLA    $1  <-- rechazado, pero no por «$3»"
    sed 's/^/             /' "$BASE/ultimo-error.txt" | head -3
    fallos=$((fallos + 1))
  fi
}

# ---------------------------------------------------------------------------
echo "== Clúster efímero =="
rm -rf "$BASE"
mkdir -p "$BASE/data" "$BASE/sock"
"$BIN/initdb" -D "$BASE/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
"$BIN/pg_ctl" -D "$BASE/data" -o "-p $PUERTO -k $BASE/sock -h ''" -l "$BASE/server.log" -w start >/dev/null
"$BIN/psql" -h "$BASE/sock" -p "$PUERTO" -U postgres -d postgres -Atc \
  "select 'PostgreSQL ' || current_setting('server_version')"

# Equivalente al rol de la aplicación en Neon: dueño de su base, con CREATEROLE, y
# **no superusuario**, que es lo que hace significativa la prueba de la extensión.
# En sentencias separadas: `create database` no puede ir dentro de un bloque de transacción,
# y `psql -c` con varias sentencias las envía como una sola, que PostgreSQL envuelve.
"$BIN/psql" -h "$BASE/sock" -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c \
  "create role $ROL login nosuperuser nocreatedb createrole"
"$BIN/psql" -h "$BASE/sock" -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c \
  "create database $BD owner $ROL"
echo -n "rol de la aplicación, superusuario = "
"$BIN/psql" -h "$BASE/sock" -p "$PUERTO" -U postgres -Atc \
  "select rolsuper from pg_roles where rolname = '$ROL'"

# ---------------------------------------------------------------------------
echo
echo "== Migraciones, con el rol NO superusuario =="
psql_app -c "create table if not exists schema_migrations (
  filename text primary key, applied_at timestamptz not null default now())"

for archivo in "$REPO"/db/*.sql; do
  nombre="$(basename "$archivo")"
  psql_app --single-transaction -f "$archivo" >/dev/null
  psql_app -c "insert into schema_migrations (filename) values ('$nombre')"
  echo "  aplicada $nombre"
done

echo
echo "== Idempotencia: la 010 otra vez =="
psql_app --single-transaction -f "$REPO/db/010_catalogo_relacional.sql" >/dev/null 2>&1
echo "  ok       la segunda ejecución no da error"

# ---------------------------------------------------------------------------
echo
echo "== Estructura =="

esperadas="attribute_options attributes categories product_attribute_values product_categories product_images product_prices product_private_data"
reales="$(psql_app -Atc "select string_agg(tablename, ' ' order by tablename) from pg_tables
  where schemaname = 'public' and tablename in (
    'categories','product_categories','product_private_data','product_images',
    'attributes','attribute_options','product_attribute_values','product_prices')")"
comprobaciones=$((comprobaciones + 1))
if [ "$reales" = "$esperadas" ]; then
  echo "  ok       existen las ocho tablas del diseño"
else
  echo "  FALLA    tablas encontradas: $reales"
  fallos=$((fallos + 1))
fi

sobra="$(psql_app -Atc "select count(*) from pg_tables where schemaname='public' and tablename='category_attributes'")"
comprobaciones=$((comprobaciones + 1))
if [ "$sobra" = "0" ]; then echo "  ok       category_attributes no existe"
else echo "  FALLA    category_attributes existe"; fallos=$((fallos + 1)); fi

codigos="$(psql_app -Atc "select count(*) from information_schema.columns
  where table_name='product_private_data' and column_name in ('sku','product_code')")"
comprobaciones=$((comprobaciones + 1))
if [ "$codigos" = "0" ]; then echo "  ok       no hay columnas sku ni product_code"
else echo "  FALLA    hay $codigos columna(s) que duplican el código"; fallos=$((fallos + 1)); fi

indice="$(psql_app -Atc "select count(*) from pg_indexes
  where tablename='product_private_data' and indexdef like '%supplier_code%'")"
unico="$(psql_app -Atc "select count(*) from pg_indexes
  where tablename='product_private_data' and indexdef like '%supplier_code%' and indexdef like 'CREATE UNIQUE%'")"
comprobaciones=$((comprobaciones + 1))
if [ "$indice" -ge 1 ] && [ "$unico" = "0" ]; then
  echo "  ok       supplier_code está indexado y no es único"
else
  echo "  FALLA    supplier_code: índices=$indice únicos=$unico"; fallos=$((fallos + 1))
fi

# ---------------------------------------------------------------------------
echo
echo "== Datos de prueba =="
psql_app -c "
insert into products (id, econoluz_reference, position, public_name, image,
                      product_type, product_type_label, application, application_label)
values ('prod-a','ECO-A',1,'Producto A','/a.png','tipo','Tipo','uso','Uso'),
       ('prod-b','ECO-B',2,'Producto B','/b.png','tipo','Tipo','uso','Uso');

insert into categories (id, slug, nombre) values (1,'techo','Techo'), (2,'led','LED');

insert into attributes (id, clave, nombre, tipo) values
  (1,'potencia','Potencia','numero'),
  (2,'temperatura','Temperatura','opcion'),
  (3,'ambiente','Ambiente','opcion_multiple'),
  (4,'sin-uso','Sin uso','texto');

insert into attribute_options (id, attribute_id, clave, etiqueta) values
  (10,2,'3000k','3000 K'),
  (20,3,'sala','Sala'),
  (21,3,'cocina','Cocina');
" >/dev/null
echo "  ok       dos productos, dos categorías, cuatro atributos y tres opciones"

# ---------------------------------------------------------------------------
echo
echo "== Categoría principal: se comprueba al CONFIRMAR =="

debe_pasar "una categoría, marcada principal" \
  "begin; insert into product_categories values ('prod-a',1,true); commit;"

debe_fallar "categorías sin ninguna principal" \
  "begin; insert into product_categories values ('prod-b',1,false); commit;" \
  "hace falta exactamente una"

debe_fallar "dos categorías principales a la vez" \
  "begin; insert into product_categories values ('prod-b',1,true),('prod-b',2,true); commit;" \
  "hace falta exactamente una"

# La razón de ser de que el trigger sea diferible: dentro de una transacción se puede pasar
# por un estado con dos principales, siempre que al confirmar quede exactamente una.
debe_pasar "reemplazar la principal en una sola transacción" \
  "begin;
   insert into product_categories values ('prod-a',2,true);
   update product_categories set principal = false where product_id='prod-a' and category_id=1;
   commit;"

# ---------------------------------------------------------------------------
echo
echo "== Imágenes =="

psql_app -c "insert into product_images (id, product_id, url, posicion, principal) values
  (1,'prod-a','/1.png',10,true), (2,'prod-a','/2.png',20,false)" >/dev/null

# El motivo de que la unicidad sea diferible: así reordena el panel hoy las fotos de obra.
debe_pasar "intercambiar dos posiciones en un solo UPDATE" \
  "begin;
   update product_images set posicion = case when id=1 then 20 else 10 end
    where id in (1,2);
   commit;"

debe_fallar "dos imágenes en la misma posición" \
  "begin; insert into product_images (id, product_id, url, posicion) values (3,'prod-a','/3.png',10); commit;" \
  "product_images_posicion_unica"

debe_fallar "dos imágenes principales" \
  "begin; insert into product_images (id, product_id, url, posicion, principal)
   values (4,'prod-a','/4.png',40,true); commit;" \
  "product_images_una_principal"

# ---------------------------------------------------------------------------
echo
echo "== Valores de atributo =="

debe_pasar "un valor numérico en su columna" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, value_number)
   values ('prod-a',1,'numero',20)"

debe_fallar "un valor de texto en un atributo numérico" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, value_text)
   values ('prod-b',1,'numero','20 W')" \
  "product_attribute_values_columna_del_tipo"

debe_fallar "declarar un tipo que no es el del atributo" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, value_text)
   values ('prod-b',1,'texto','20 W')" \
  "product_attribute_values_atributo_fk"

debe_fallar "dos valores escalares del mismo atributo" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, value_number)
   values ('prod-a',1,'numero',25)" \
  "product_attribute_values_escalar_unico"

debe_fallar "una opción de otro atributo" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, option_id)
   values ('prod-a',3,'opcion_multiple',10)" \
  "product_attribute_values_opcion_fk"

debe_pasar "dos opciones distintas en opcion_multiple" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, option_id)
   values ('prod-a',3,'opcion_multiple',20), ('prod-a',3,'opcion_multiple',21)"

debe_fallar "la misma opción dos veces" \
  "insert into product_attribute_values (product_id, attribute_id, attribute_type, option_id)
   values ('prod-a',3,'opcion_multiple',20)" \
  "option_id"

# ---------------------------------------------------------------------------
echo
echo "== Definiciones: borrar lo no usado, desactivar lo usado =="

debe_fallar "cambiar el tipo de un atributo usado" \
  "update attributes set tipo='texto' where id=1" \
  "product_attribute_values_atributo_fk"

debe_pasar "cambiar el tipo de un atributo sin usar" \
  "update attributes set tipo='numero' where id=4"

debe_fallar "borrar un atributo usado" \
  "delete from attributes where id=1" \
  "product_attribute_values_atributo_fk"

debe_pasar "borrar un atributo sin usar" \
  "delete from attributes where id=4"

debe_fallar "borrar una opción usada" \
  "delete from attribute_options where id=20" \
  "product_attribute_values_opcion_fk"

debe_pasar "desactivar un atributo usado" \
  "update attributes set active=false where id=1"

debe_pasar "desactivar una opción usada" \
  "update attribute_options set active=false where id=20"

# ---------------------------------------------------------------------------
echo
echo "== Precios =="

debe_pasar "una promoción" \
  "insert into product_prices (product_id, centavos, tipo, vigencia)
   values ('prod-a', 99900, 'promocion', tstzrange('2026-01-01','2026-02-01','[)'))"

debe_fallar "una promoción solapada del mismo producto" \
  "insert into product_prices (product_id, centavos, tipo, vigencia)
   values ('prod-a', 88800, 'promocion', tstzrange('2026-01-15','2026-03-01','[)'))" \
  "product_prices_sin_promociones_solapadas"

debe_pasar "una promoción consecutiva, sin solape" \
  "insert into product_prices (product_id, centavos, tipo, vigencia)
   values ('prod-a', 77700, 'promocion', tstzrange('2026-02-01','2026-03-01','[)'))"

debe_pasar "la misma promoción para otro producto" \
  "insert into product_prices (product_id, centavos, tipo, vigencia)
   values ('prod-b', 99900, 'promocion', tstzrange('2026-01-01','2026-02-01','[)'))"

debe_fallar "un precio negativo" \
  "insert into product_prices (product_id, centavos) values ('prod-a', -1)" \
  "product_prices_no_negativo"

# ---------------------------------------------------------------------------
echo
echo "== Resultado =="
echo "  $comprobaciones comprobaciones, $fallos fallo(s)"
[ "$fallos" -eq 0 ]
