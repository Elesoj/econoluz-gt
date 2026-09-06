// tests/envios-contratos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { aEnvioPublico } from "../app/envios/contratos";
import { validarZona, validarTarifa, validarLineasEstimacion } from "../app/envios/validacion";

const MOTIVOS = [
  "sin_cobertura",
  "zona_inactiva",
  "cobertura_desactivada",
  "sin_tarifa_vigente",
  "direccion_sin_codigos",
  "pedido_grande",
] as const;

test("los seis motivos internos producen el mismo estado público", () => {
  for (const motivo of MOTIVOS) {
    const publico = aEnvioPublico({ estimacion: false, tipo: "requiere_cotizacion", motivo });
    assert.equal(publico.estado, "cotizacion_requerida");
    assert.equal(JSON.stringify(publico).includes(motivo), false, `se filtró ${motivo}`);
  }
});

test("el DTO público de Guatex no inventa un coste ni promete gratuidad", () => {
  const publico = aEnvioPublico({
    estimacion: false,
    tipo: "solicitud_contacto",
    metodo: "guatex",
    envioCents: null,
    gratuito: false,
    faltanParaGratisCents: null,
  });
  assert.equal(publico.estado, "solicitud_contacto");
  assert(publico.estado === "solicitud_contacto");
  // Cero significaría «el envío es gratis»; desconocido se escribe null.
  assert.equal(publico.envioCents, null);
  assert.notEqual(publico.envioCents, 0);
  assert.equal(publico.gratuito, false);
});

test("carrito_no_comprable sí puede nombrar referencias públicas", () => {
  const publico = aEnvioPublico({
    estimacion: false,
    tipo: "carrito_no_comprable",
    referencias: ["ECO-0001"],
  });
  assert.equal(publico.estado, "carrito_no_comprable");
  assert.deepEqual(publico.referencias, ["ECO-0001"]);
});

test("la avería no se confunde con una cotización", () => {
  const publico = aEnvioPublico({ estimacion: false, tipo: "no_disponible", causa: "datos" });
  assert.equal(publico.estado, "servicio_no_disponible");
});

test("la recogida desactivada tiene su propio estado", () => {
  const publico = aEnvioPublico({
    estimacion: false,
    tipo: "metodo_no_disponible",
    metodo: "recogida_en_tienda",
  });
  assert.equal(publico.estado, "recogida_no_disponible");
});

test("la marca de estimación se conserva", () => {
  const publico = aEnvioPublico({
    estimacion: true,
    tipo: "requiere_cotizacion",
    motivo: "sin_cobertura",
  });
  assert.equal(publico.estimacion, true);
});

test("la recogida en tienda sin coste produce su estado público propio", () => {
  const publico = aEnvioPublico({
    estimacion: false,
    tipo: "sin_coste",
    metodo: "recogida_en_tienda",
    envioCents: 0,
  });
  assert.equal(publico.estado, "recogida_en_tienda");
  assert.equal(publico.envioCents, 0);
});

test("el slug de zona respeta formato y longitud", () => {
  assert.equal(validarZona({ codigo: "capital", nombre: "Capital", notas: "" }).ok, true);
  assert.equal(validarZona({ codigo: "Capital", nombre: "Capital", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "a", nombre: "Capital", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "con espacio", nombre: "X", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "z".repeat(41), nombre: "X", notas: "" }).ok, false);
});

test("los importes y límites de tarifa respetan sus rangos", () => {
  const base = {
    importeCents: 3500,
    umbralGratisCents: null,
    maxPiezas: null,
    maxImporteCents: null,
    plazoMinDias: 2,
    plazoMaxDias: 3,
  };
  assert.equal(validarTarifa(base).ok, true);
  assert.equal(validarTarifa({ ...base, importeCents: -1 }).ok, false);
  assert.equal(validarTarifa({ ...base, importeCents: 100001 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 0 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 1000 }).ok, false);
  assert.equal(validarTarifa({ ...base, plazoMaxDias: 1 }).ok, false);
  assert.equal(validarTarifa({ ...base, plazoMaxDias: 61 }).ok, false);
  // El umbral NO se compara con el importe: es una promoción legítima.
  assert.equal(validarTarifa({ ...base, umbralGratisCents: 2000 }).ok, true);
});

test("la estimación anónima acota líneas y cantidades", () => {
  const linea = { econoluzReference: "ECO-0001", cantidad: 1 };
  assert.equal(validarLineasEstimacion([linea]).ok, true);
  assert.equal(validarLineasEstimacion([]).ok, false);
  assert.equal(validarLineasEstimacion(Array(101).fill(linea)).ok, false);
  assert.equal(validarLineasEstimacion([{ ...linea, cantidad: 0 }]).ok, false);
  assert.equal(validarLineasEstimacion([{ ...linea, cantidad: 1000 }]).ok, false);
});
