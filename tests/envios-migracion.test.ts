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

test("ninguna clave foránea hacia zonas borra en cascada", () => {
  assert.doesNotMatch(sql, /references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+cascade/i);
  const restricts = sql.match(/references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/gi) ?? [];
  assert.equal(restricts.length, 2, "cobertura y tarifas deben restringir el borrado");
});

test("la cobertura usa claves foráneas reales y exige exactamente un ámbito", () => {
  assert.match(sql, /departamento_codigo\s+char\(2\)\s+references\s+geo_departamentos/i);
  assert.match(sql, /municipio_codigo\s+char\(4\)\s+references\s+geo_municipios/i);
  assert.match(sql, /num_nonnulls\s*\(\s*departamento_codigo\s*,\s*municipio_codigo\s*\)\s*=\s*1/i);
});

test("hay unicidad parcial por nivel", () => {
  assert.match(sql, /unique index[^;]*\(departamento_codigo\)\s*where\s+departamento_codigo\s+is\s+not\s+null/i);
  assert.match(sql, /unique index[^;]*\(municipio_codigo\)\s*where\s+municipio_codigo\s+is\s+not\s+null/i);
});

test("una sola tarifa publicada vigente por zona", () => {
  assert.match(sql, /exclude\s+using\s+gist\s*\(\s*zone_id\s+with\s+=\s*,\s*periodo\s+with\s+&&\s*\)\s*where\s*\(\s*publicada\s*\)/i);
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
  assert.match(sql, /create trigger shipping_rates_no_reescribir\s+before update on shipping_rates\s+for each row execute function shipping_rates_inmutable\(\)()/i);
  assert.match(sql, /Una tarifa publicada no cambia sus campos economicos/);
  assert.match(sql, /Una tarifa publicada no se despublica/);
  assert.match(sql, /La vigencia de una tarifa publicada se cierra una sola vez/);
});

test("no se programan tarifas a futuro: disparador before insert", () => {
  assert.match(sql, /create or replace function shipping_rates_sin_programar\(\)/i);
  assert.match(sql, /create trigger shipping_rates_no_programar\s+before insert on shipping_rates\s+for each row execute function shipping_rates_sin_programar\(\)()/i);
  assert.match(sql, /Una tarifa se publica abierta, sin fecha de fin/);
  assert.match(sql, /Una tarifa se publica en el momento, no con fecha futura/);
});

test("una tarifa publicada no se borra: disparador before delete", () => {
  assert.match(sql, /create or replace function shipping_rates_no_borrar\(\)/i);
  assert.match(sql, /create trigger shipping_rates_borrado_restringido\s+before delete on shipping_rates\s+for each row execute function shipping_rates_no_borrar\(\)()/i);
  assert.match(sql, /Una tarifa publicada no se borra/);
});

test("los campos economicos vigilados por el disparador son los seis de §4.8 mas zona y vigencia", () => {
  for (const campo of [
    "importe_cents",
    "umbral_gratis_cents",
    "max_piezas",
    "max_importe_cents",
    "plazo_min_dias",
    "plazo_max_dias",
    "zone_id",
    "vigente_desde",
  ]) {
    assert.match(
      sql,
      new RegExp(`new\.${campo} is distinct from old\.${campo}`, "i"),
      campo,
    );
  }
});

test("la migración no rellena las direcciones existentes", () => {
  // El emparejador de municipios es TypeScript y nace en una tarea posterior: una
  // migracion SQL no puede invocarlo, asi que aqui no hay ningun `update`.
  assert.doesNotMatch(sql, /update\s+user_addresses/i);
});
