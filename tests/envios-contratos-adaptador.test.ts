import test from "node:test";
import assert from "node:assert/strict";
import {
  aEnvioPublico,
  type ResultadoDeEnvio,
} from "../app/envios/contratos";

test("aEnvioPublico adapta 'calculado' con envioCents, gratuito y faltanParaGratisCents", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "calculado",
    metodo: "mensajero_propio",
    envioCents: 3500,
    gratuito: false,
    faltanParaGratisCents: 10000,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "calculado",
    metodo: "mensajero_propio",
    envioCents: 3500,
    gratuito: false,
    faltanParaGratisCents: 10000,
  });
});

test("aEnvioPublico adapta 'solicitud_contacto' (Guatex)", () => {
  const r: ResultadoDeEnvio = {
    estimacion: true,
    tipo: "solicitud_contacto",
    metodo: "guatex",
    envioCents: null,
    gratuito: false,
    faltanParaGratisCents: null,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: true,
    estado: "solicitud_contacto",
    metodo: "guatex",
    envioCents: null,
    gratuito: false,
    faltanParaGratisCents: null,
  });
});

test("aEnvioPublico adapta 'sin_coste' (recogida en tienda)", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "sin_coste",
    metodo: "recogida_en_tienda",
    envioCents: 0,
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "recogida_en_tienda",
    envioCents: 0,
  });
});

test("aEnvioPublico adapta 'requiere_cotizacion'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "requiere_cotizacion",
    motivo: "direccion_sin_codigos",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "cotizacion_requerida",
  });
});

test("aEnvioPublico adapta 'metodo_no_disponible'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "metodo_no_disponible",
    metodo: "recogida_en_tienda",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "recogida_no_disponible",
  });
});

test("aEnvioPublico adapta 'carrito_no_comprable'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "carrito_no_comprable",
    referencias: ["ECO-001"],
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "carrito_no_comprable",
    referencias: ["ECO-001"],
  });
});

test("aEnvioPublico adapta 'no_disponible'", () => {
  const r: ResultadoDeEnvio = {
    estimacion: false,
    tipo: "no_disponible",
    causa: "datos",
  };
  const pub = aEnvioPublico(r);
  assert.deepEqual(pub, {
    estimacion: false,
    estado: "servicio_no_disponible",
  });
});
