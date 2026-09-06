// tests/envios-servicio.test.ts
//
// El orquestador recibe sus dependencias como parámetro, así que se prueba entero
// sin Neon, sin sesión y sin red.
import test from "node:test";
import assert from "node:assert/strict";
import { orquestar, type DependenciasEnvios } from "../app/envios/orquestacion";
import { estimarEnvio } from "../app/envios/envios.server";
import { ErrorDeDatos } from "../app/lib/datos/errores";
import { mapaMetodosPorDefecto } from "../app/envios/zonasCapitalinas";
import { REGLAS_PROPIAS_DEFECTO } from "../app/envios/tarifas";

const depsOperativas = (parches: Partial<DependenciasEnvios> = {}): DependenciasEnvios => ({
  leerConfiguracion: async () => ({
    recogidaActiva: false,
    metodosZonas: mapaMetodosPorDefecto(),
    reglasPropias: REGLAS_PROPIAS_DEFECTO,
  }),
  leerCarrito: async () => ({ lineas: [{ econoluzReference: "ECO-0001", cantidad: 2 }] }),
  resolverProductos: async () => ({ piezas: 2, subtotalCents: 100_000, descartadas: [] }),
  ahora: () => new Date("2026-06-01T00:00:00Z"),
  ...parches,
});

test("la recogida desactivada por defecto devuelve metodo_no_disponible", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" }, depsOperativas());
  assert.equal(r.tipo, "metodo_no_disponible");
});

test("la recogida activa devuelve Q0 y no mira la geografía", async () => {
  const r = await orquestar(
    { tipo: "recogida_en_tienda" },
    depsOperativas({
      leerConfiguracion: async () => ({
        recogidaActiva: true,
        metodosZonas: mapaMetodosPorDefecto(),
        reglasPropias: REGLAS_PROPIAS_DEFECTO,
      }),
    }),
  );
  assert.equal(r.tipo, "sin_coste");
  if (r.tipo === "sin_coste") {
    assert.equal(r.envioCents, 0);
  }
});

test("un carrito con líneas no comprables detiene el cálculo", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }),
    }),
  );
  assert.equal(r.tipo, "carrito_no_comprable");
  if (r.tipo === "carrito_no_comprable") {
    assert.deepEqual(r.referencias, ["ECO-0009"]);
  }
});

test("el carrito se comprueba antes que la recogida", async () => {
  const r = await orquestar(
    { tipo: "recogida_en_tienda" },
    depsOperativas({
      resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }),
    }),
  );
  assert.equal(r.tipo, "carrito_no_comprable");
});

test("un fallo de datos no es una cotización", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      leerConfiguracion: async () => {
        throw new ErrorDeDatos("indisponible", "falló");
      },
    }),
  );
  assert.equal(r.tipo, "no_disponible");
  if (r.tipo === "no_disponible") {
    assert.equal(r.causa, "datos");
  }
});

test("municipio de Guatemala con zona en mensajero propio calcula tarifa fija Q35", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      resolverProductos: async () => ({ piezas: 1, subtotalCents: 100_000, descartadas: [] }),
    }),
  );
  assert.equal(r.tipo, "calculado");
  if (r.tipo === "calculado") {
    assert.equal(r.metodo, "mensajero_propio");
    assert.equal(r.envioCents, 3500);
    assert.equal(r.gratuito, false);
    assert.equal(r.faltanParaGratisCents, 150_000);
  }
});

test("municipio de Guatemala con subtotal >= Q2.500 calcula gratuidad", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      resolverProductos: async () => ({ piezas: 3, subtotalCents: 250_000, descartadas: [] }),
    }),
  );
  assert.equal(r.tipo, "calculado");
  if (r.tipo === "calculado") {
    assert.equal(r.metodo, "mensajero_propio");
    assert.equal(r.envioCents, 0);
    assert.equal(r.gratuito, true);
    assert.equal(r.faltanParaGratisCents, 0);
  }
});

test("municipio de Guatemala con zona asignada a Guatex (ej. 6, 17 o 18) devuelve coste desconocido", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 6 },
    depsOperativas(),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});

test("destino fuera del municipio de Guatemala deriva a Guatex con coste desconocido", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0108" },
    depsOperativas(),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});

test("direccion guardada con zona capitalina 17 deriva a Guatex", async () => {
  const r = await orquestar(
    { tipo: "direccion_guardada", direccionId: "dir-42" },
    depsOperativas({
      leerDireccion: async () => ({
        departamentoCodigo: "01",
        municipioCodigo: "0101",
        zonaCapitalina: 17,
      }),
    }),
  );
  assert.equal(r.tipo, "solicitud_contacto");
  if (r.tipo === "solicitud_contacto") {
    assert.equal(r.metodo, "guatex");
    assert.equal(r.envioCents, null);
  }
});

test("un método inventado en la configuración no fabrica una tarifa de mensajero propio", async () => {
  const metodosCorruptos = {
    ...mapaMetodosPorDefecto(),
    10: "avion_privado" as unknown as "mensajero_propio",
  };
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas({
      leerConfiguracion: async () => ({
        recogidaActiva: false,
        metodosZonas: metodosCorruptos,
        reglasPropias: REGLAS_PROPIAS_DEFECTO,
      }),
    }),
  );
  // Un valor que no es ninguno de los dos métodos no puede colarse como mensajero
  // propio ni inventar un importe: se deriva a Guatex, que es lo seguro.
  assert.equal(r.tipo, "solicitud_contacto");
});

test("una dirección guardada sin códigos pide cotización con su motivo", async () => {
  const r = await orquestar(
    { tipo: "direccion_guardada", direccionId: "7" },
    depsOperativas({
      leerDireccion: async () => ({ departamentoCodigo: null, municipioCodigo: null }),
    }),
  );
  assert.equal(r.tipo, "requiere_cotizacion");
  if (r.tipo === "requiere_cotizacion") {
    assert.equal(r.motivo, "direccion_sin_codigos");
  }
});

test("un destino directo con códigos que no se corresponden se rechaza", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "02", municipioCodigo: "0101" },
    depsOperativas(),
  );
  assert.equal(r.tipo, "requiere_cotizacion");
  if (r.tipo === "requiere_cotizacion") {
    assert.equal(r.motivo, "direccion_sin_codigos");
  }
});

test("el municipio de Guatemala sin zona capitalina no puede resolverse", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    depsOperativas(),
  );
  assert.equal(r.tipo, "requiere_cotizacion");
  if (r.tipo === "requiere_cotizacion") {
    assert.equal(r.motivo, "direccion_sin_codigos");
  }
});

test("una zona inexistente (la 20) en el municipio de Guatemala no se acepta", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 20 },
    depsOperativas(),
  );
  assert.equal(r.tipo, "requiere_cotizacion");
});

test("la estimación anónima se marca como tal", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    depsOperativas(),
    { estimacion: true, lineas: [{ econoluzReference: "ECO-0001", cantidad: 1 }] },
  );
  assert.equal(r.estimacion, true);
});

const LINEAS_INVALIDAS = [
  ["cantidad menor a 1", [{ econoluzReference: "ECO-0001", cantidad: 0 }]],
  ["cantidad superior a 999", [{ econoluzReference: "ECO-0001", cantidad: 1000 }]],
  ["referencia vacía", [{ econoluzReference: "   ", cantidad: 1 }]],
  [
    "más de 100 líneas",
    Array.from({ length: 101 }, (_, i) => ({
      econoluzReference: "ECO-" + String(i + 1).padStart(4, "0"),
      cantidad: 1,
    })),
  ],
] as const;

for (const [caso, lineas] of LINEAS_INVALIDAS) {
  test("la estimación rechaza líneas con " + caso + " sin consultar productos", async () => {
    let llamadoResolver = false;
    const r = await orquestar(
      { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
      depsOperativas({
        resolverProductos: async () => {
          llamadoResolver = true;
          return { piezas: 0, subtotalCents: 0, descartadas: [] };
        },
      }),
      { estimacion: true, lineas },
    );

    assert.equal(llamadoResolver, false);
    assert.deepEqual(r, {
      estimacion: true,
      tipo: "carrito_no_comprable",
      referencias: [],
    });
  });
}

test("estimarEnvio rechaza directamente líneas inválidas sin consultar productos ni base de datos", async () => {
  const r = await estimarEnvio(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101", zonaCapitalina: 10 },
    [{ econoluzReference: "ECO-0001", cantidad: 0 }],
  );

  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});
