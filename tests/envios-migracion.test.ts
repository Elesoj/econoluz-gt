// tests/envios-migracion.test.ts
//
// Pruebas estructurales de `db/013_envios_tarifas.sql`: leen el texto del archivo y
// comprueban que los invariantes del modelo estan escritos en el esquema, no confiados
// al codigo de la aplicacion. No abren ninguna conexion: la verificacion contra una base
// real es otra tarea.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/013_envios_tarifas.sql", "utf8");

// Recorta el cuerpo de un `create table` para poder afirmar dentro de una sola tabla.
// Sin esto, contar apariciones en todo el archivo confunde el DDL con la prosa de los
// comentarios y no distingue en que tabla esta cada restriccion.
const cuerpoDeTabla = (tabla: string): string => {
  const inicio = sql.indexOf(`create table if not exists ${tabla} (`);
  assert.notEqual(inicio, -1, `no se encontró la tabla ${tabla}`);
  const fin = sql.indexOf("\n);", inicio);
  assert.notEqual(fin, -1, `no se encontró el final de la tabla ${tabla}`);
  return sql.slice(inicio, fin);
};

test("ninguna clave foránea hacia zonas borra en cascada", () => {
  assert.doesNotMatch(sql, /references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+cascade/i);
  const restricts = sql.match(/references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/gi) ?? [];
  assert.equal(restricts.length, 2, "cobertura y tarifas deben restringir el borrado");

  // Refuerzo: cada `restrict` atado a su tabla. Contarlos sueltos daba por buenos dos en
  // la misma tabla y ninguno en la otra.
  for (const tabla of ["shipping_zone_areas", "shipping_rates"]) {
    const enLaTabla =
      cuerpoDeTabla(tabla).match(
        /references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/gi,
      ) ?? [];
    assert.equal(enLaTabla.length, 1, `${tabla} debe restringir el borrado de su zona`);
  }
});

test("la cobertura usa claves foráneas reales y exige exactamente un ámbito", () => {
  assert.match(sql, /departamento_codigo\s+char\(2\)\s+references\s+geo_departamentos/i);
  assert.match(sql, /municipio_codigo\s+char\(4\)\s+references\s+geo_municipios/i);
  assert.match(sql, /num_nonnulls\s*\(\s*departamento_codigo\s*,\s*municipio_codigo\s*\)\s*=\s*1/i);
});

test("hay unicidad parcial por nivel, sobre shipping_zone_areas", () => {
  // Refuerzo: los indices van atados a su tabla. `unique index[^;]*(columna)` aceptaba
  // cualquier `create unique index` del archivo.
  assert.match(
    sql,
    /create unique index[^;]*on\s+shipping_zone_areas\s*\(departamento_codigo\)\s*where\s+departamento_codigo\s+is\s+not\s+null/i,
  );
  assert.match(
    sql,
    /create unique index[^;]*on\s+shipping_zone_areas\s*\(municipio_codigo\)\s*where\s+municipio_codigo\s+is\s+not\s+null/i,
  );
});

test("una sola tarifa publicada vigente por zona", () => {
  assert.match(sql, /exclude\s+using\s+gist\s*\(\s*zone_id\s+with\s+=\s*,\s*periodo\s+with\s+&&\s*\)\s*where\s*\(\s*publicada\s*\)/i);
});

test("las dos tablas hijas indexan su zone_id", () => {
  // `zone_id` es clave foránea `on delete restrict` y Postgres no indexa el lado hijo:
  // sin estos índices, tocar una zona escanea la tabla entera. El índice del `exclude` no
  // sirve, porque es GiST y solo cubre las tarifas publicadas.
  assert.match(sql, /create index[^;]*on\s+shipping_zone_areas\s*\(zone_id\)/i);
  assert.match(sql, /create index[^;]*on\s+shipping_rates\s*\(zone_id\)/i);
});

test("user_addresses gana la clave compuesta y su check", () => {
  assert.match(sql, /foreign key\s*\(\s*municipio_codigo\s*,\s*departamento_codigo\s*\)/i);
  assert.match(sql, /municipio_codigo is null or departamento_codigo is not null/i);
});

test("el rol público queda revocado en las tres tablas y sus secuencias", () => {
  for (const t of ["shipping_zones", "shipping_zone_areas", "shipping_rates"]) {
    assert.match(sql, new RegExp(`revoke all[^;]*${t}[^;]*econoluz_publico`, "is"), t);
    // Refuerzo sobre el enunciado original, que solo buscaba la palabra «sequences»: la
    // especificacion §7.3 pide revocacion explicita de cada secuencia, y una sola
    // revocacion global la habria dado por buena sin nombrar ninguna.
    assert.match(
      sql,
      new RegExp(`revoke all[^;]*sequence[^;]*${t}_id_seq[^;]*econoluz_publico`, "is"),
      `${t}_id_seq`,
    );
  }
});

test("las cinco tablas nuevas de 9A están dadas de alta en verificar-permisos", () => {
  // Sin esto, `npm run test:permisos` no fallaria aunque se le concediera acceso al rol
  // publico: su lista de tablas prohibidas es explicita.
  const guardian = readFileSync("scripts/verificar-permisos.mjs", "utf8");
  for (const tabla of [
    "geo_departamentos",
    "geo_municipios",
    "shipping_zones",
    "shipping_zone_areas",
    "shipping_rates",
  ]) {
    assert.match(guardian, new RegExp(`"${tabla}"`), tabla);
  }
});

test("no siembra ninguna tarifa ni zona", () => {
  assert.doesNotMatch(sql, /insert\s+into\s+shipping_(zones|zone_areas|rates)/i);
});

test("no hay importes comerciales escritos", () => {
  assert.doesNotMatch(sql, /\b3500\b|\b250000\b/);
});

// --- Refuerzos: los tres disparadores son el nucleo de §4.8 y §4.8.1, y ninguna de las
// ocho pruebas del enunciado los miraba. Un SQL sin ellos las pasaba todas.

test("la tarifa publicada no se reescribe: disparador before update", () => {
  assert.match(sql, /create or replace function shipping_rates_inmutable\(\)/i);
  assert.match(sql, /create trigger shipping_rates_no_reescribir\s+before update on shipping_rates\s+for each row execute function shipping_rates_inmutable\(\)/i);
  assert.match(sql, /Una tarifa publicada no cambia sus campos económicos/);
  assert.match(sql, /Una tarifa publicada no se despublica/);
  assert.match(sql, /La vigencia de una tarifa publicada se cierra una sola vez/);
});

test("no se programan tarifas a futuro, ni al insertar ni al publicar un borrador", () => {
  assert.match(sql, /create or replace function shipping_rates_sin_programar\(\)/i);
  // CRITICO 1. Atado solo a `insert`, publicar un borrador con un `update` se saltaba la
  // prohibicion entera: `publicada` nace en `false`, asi que un borrador con
  // `vigente_desde` futuro y `vigente_hasta` informado pasaba a publicado sin control, y
  // quedaba inmodificable, imborrable y ocupando el `exclude` de su zona.
  assert.match(sql, /create trigger shipping_rates_no_programar\s+before insert or update on shipping_rates\s+for each row execute function shipping_rates_sin_programar\(\)/i);
  // La guarda es por transicion, no por estado: asi el cierre legitimo de §6.4 sobre una
  // fila ya publicada sigue pasando.
  assert.match(sql, /if new\.publicada and \(tg_op = 'INSERT' or not old\.publicada\) then/i);
  assert.match(sql, /Una tarifa se publica abierta, sin fecha de fin/);
  assert.match(sql, /Una tarifa se publica en el momento, no con fecha futura/);
});

test("cerrar la vigencia a futuro está prohibido", () => {
  // CRITICO 2. Un cierre a futuro es programar una despublicacion, y es irreversible: la
  // regla de «una sola vez» impide corregir la fecha y la fila no se puede borrar.
  assert.match(sql, /if old\.vigente_hasta is null and new\.vigente_hasta > now\(\) then/i);
  assert.match(sql, /La vigencia de una tarifa publicada se cierra en el momento, no a futuro/);
});

test("una tarifa publicada no se borra: disparador before delete", () => {
  assert.match(sql, /create or replace function shipping_rates_no_borrar\(\)/i);
  assert.match(sql, /create trigger shipping_rates_borrado_restringido\s+before delete on shipping_rates\s+for each row execute function shipping_rates_no_borrar\(\)/i);
  assert.match(sql, /Una tarifa publicada no se borra/);
});

test("los campos vigilados por el disparador son los de §4.8 más zona, vigencia y creación", () => {
  for (const campo of [
    "importe_cents",
    "umbral_gratis_cents",
    "max_piezas",
    "max_importe_cents",
    "plazo_min_dias",
    "plazo_max_dias",
    "zone_id",
    "vigente_desde",
    "creado_en",
  ]) {
    assert.match(
      sql,
      new RegExp(`new\\.${campo} is distinct from old\\.${campo}`, "i"),
      campo,
    );
  }
});

test("actualizado_en se mantiene solo en las dos tablas que lo tienen", () => {
  for (const tabla of ["shipping_zones", "shipping_rates"]) {
    assert.match(
      sql,
      new RegExp(
        `create trigger ${tabla}_touch_actualizado_en\\s+before update on ${tabla}\\s+for each row\\s+execute function ${tabla}_touch_actualizado_en\\(\\)`,
        "i",
      ),
      tabla,
    );
  }
  // `shipping_zone_areas` no tiene la columna, asi que no debe llevar disparador.
  assert.doesNotMatch(sql, /shipping_zone_areas_touch_actualizado_en/i);
});

test("las sentencias que no admiten «if not exists» llevan su drop delante", () => {
  // Coherencia interna: todo lo demas del archivo es `if not exists` u `or replace`, y
  // estas cinco eran la unica grieta por la que una reejecucion parcial fallaba a mitad.
  for (const disparador of [
    "shipping_rates_no_reescribir",
    "shipping_rates_no_programar",
    "shipping_rates_borrado_restringido",
    "shipping_zones_touch_actualizado_en",
    "shipping_rates_touch_actualizado_en",
  ]) {
    assert.match(sql, new RegExp(`drop trigger if exists ${disparador} on `, "i"), disparador);
  }
  for (const restriccion of [
    "user_addresses_municipio_del_departamento",
    "user_addresses_municipio_exige_departamento",
  ]) {
    assert.match(sql, new RegExp(`drop constraint if exists ${restriccion}`, "i"), restriccion);
  }
});

test("la migración no rellena las direcciones existentes", () => {
  // El emparejador de municipios es TypeScript y nace en una tarea posterior: una
  // migracion SQL no puede invocarlo, asi que aqui no hay ningun `update`.
  assert.doesNotMatch(sql, /update\s+user_addresses/i);
});
