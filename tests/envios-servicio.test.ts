// tests/envios-servicio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { orquestar, estimarEnvio } from "../app/envios/envios.server";
import { ErrorDeDatos } from "../app/lib/datos/errores";

// `orquestar` recibe sus dependencias como parámetro para poder probarse sin Neon.
const deps = (parches = {}) => ({
  leerConfiguracion: async () => ({ recogidaActiva: true, cobertura: [], zonas: [], tarifas: [] }),
  leerCarrito: async () => ({ lineas: [{ econoluzReference: "ECO-0001", cantidad: 2 }] }),
  resolverProductos: async () => ({ piezas: 2, subtotalCents: 100_000, descartadas: [] }),
  ahora: () => new Date("2026-06-01T00:00:00Z"),
  ...parches,
});

test("la recogida activa devuelve Q0 sin plazo y sin tocar geografía", async () => {
  let miroGeografia = false;
  const r = await orquestar({ tipo: "recogida_en_tienda" }, deps({
    leerConfiguracion: async () => { miroGeografia = true; return { recogidaActiva: true }; },
  }));
  assert.equal(miroGeografia, true);
  assert.equal(r.tipo, "sin_coste");
  assert.equal(r.envioCents, 0);
  assert.equal("plazoMinDias" in r, false);
});

test("la recogida desactivada no cae al paso geográfico", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" }, deps({
    leerConfiguracion: async () => ({ recogidaActiva: false }),
  }));
  assert.equal(r.tipo, "metodo_no_disponible");
});

test("un carrito con líneas no comprables detiene el cálculo", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }) }));
  assert.equal(r.tipo, "carrito_no_comprable");
  assert.deepEqual(r.referencias, ["ECO-0009"]);
});

test("el carrito se comprueba antes que la recogida", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" },
    deps({ resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }) }));
  assert.equal(r.tipo, "carrito_no_comprable");
});

test("un fallo de datos no es una cotización", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ leerConfiguracion: async () => { throw new ErrorDeDatos("indisponible", "falló"); } }));
  assert.equal(r.tipo, "no_disponible");
  assert.equal(r.causa, "datos");
});

test("una dirección sin códigos pide cotización con su motivo", async () => {
  const r = await orquestar({ tipo: "direccion_guardada", direccionId: "7" }, deps({
    leerDireccion: async () => ({ departamentoCodigo: null, municipioCodigo: null }),
  }));
  assert.equal(r.tipo, "requiere_cotizacion");
  assert.equal(r.motivo, "direccion_sin_codigos");
});

test("un destino directo con códigos que no se corresponden se rechaza", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "02", municipioCodigo: "0101" },
    deps());
  assert.equal(r.tipo, "requiere_cotizacion");
  assert.equal(r.motivo, "direccion_sin_codigos");
});

test("dos filas aplicables son un error interno, no un precio al azar", async () => {
  await assert.rejects(() => orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ leerConfiguracion: async () => ({
      recogidaActiva: true,
      cobertura: [{ zoneId: 1, municipioCodigo: "0101", departamentoCodigo: null, activa: true }],
      zonas: [{ id: 1, codigo: "a", nombre: "A", metodo: "paqueteria", activa: true }],
      tarifas: [{ zoneId: 1, publicada: true }, { zoneId: 1, publicada: true }],
    }) }),
  ));
});

test("la estimación anónima se marca como tal", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps(), { estimacion: true, lineas: [{ econoluzReference: "ECO-0001", cantidad: 1 }] });
  assert.equal(r.estimacion, true);
});

test("una zona con una tarifa cerrada en el pasado y otra vigente resuelve limpiamente la vigente sin error de determinismo", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      ahora: () => new Date("2026-06-01T00:00:00Z"),
      leerConfiguracion: async () => ({
        recogidaActiva: true,
        cobertura: [{ zoneId: 1, municipioCodigo: "0101", departamentoCodigo: null, activa: true }],
        zonas: [{ id: 1, codigo: "metropolitana", nombre: "Metropolitana", metodo: "mensajero_propio", activa: true }],
        tarifas: [
          {
            zoneId: 1,
            publicada: true,
            importeCents: 2500,
            vigenteDesde: new Date("2025-01-01T00:00:00Z"),
            vigenteHasta: new Date("2026-01-01T00:00:00Z"),
          },
          {
            zoneId: 1,
            publicada: true,
            importeCents: 3500,
            vigenteDesde: new Date("2026-01-01T00:00:00Z"),
            vigenteHasta: null,
          },
        ],
      }),
    }),
  );

  assert.equal(r.tipo, "con_tarifa");
  if (r.tipo === "con_tarifa") {
    assert.equal(r.envioCents, 3500);
    assert.equal(r.zonaCodigo, "metropolitana");
  }
});

test("una zona sin tarifa vigente devuelve requiere_cotizacion por sin_tarifa_vigente", async () => {
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      ahora: () => new Date("2026-06-01T00:00:00Z"),
      leerConfiguracion: async () => ({
        recogidaActiva: true,
        cobertura: [{ zoneId: 1, municipioCodigo: "0101", departamentoCodigo: null, activa: true }],
        zonas: [{ id: 1, codigo: "metropolitana", nombre: "Metropolitana", metodo: "mensajero_propio", activa: true }],
        tarifas: [
          {
            zoneId: 1,
            publicada: true,
            importeCents: 2500,
            vigenteDesde: new Date("2025-01-01T00:00:00Z"),
            vigenteHasta: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      }),
    }),
  );

  assert.equal(r.tipo, "requiere_cotizacion");
  if (r.tipo === "requiere_cotizacion") {
    assert.equal(r.motivo, "sin_tarifa_vigente");
  }
});

test("la estimación rechaza líneas con cantidad menor a 1", async () => {
  let llamadoResolver = false;
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      resolverProductos: async () => {
        llamadoResolver = true;
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      },
    }),
    { estimacion: true, lineas: [{ econoluzReference: "ECO-0001", cantidad: 0 }] },
  );

  assert.equal(llamadoResolver, false);
  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});

test("la estimación rechaza líneas con cantidad superior a 999", async () => {
  let llamadoResolver = false;
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      resolverProductos: async () => {
        llamadoResolver = true;
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      },
    }),
    { estimacion: true, lineas: [{ econoluzReference: "ECO-0001", cantidad: 1000 }] },
  );

  assert.equal(llamadoResolver, false);
  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});

test("la estimación rechaza más de 100 líneas", async () => {
  let llamadoResolver = false;
  const lineasMasDe100 = Array.from({ length: 101 }, (_, i) => ({
    econoluzReference: `ECO-${String(i + 1).padStart(4, "0")}`,
    cantidad: 1,
  }));

  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      resolverProductos: async () => {
        llamadoResolver = true;
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      },
    }),
    { estimacion: true, lineas: lineasMasDe100 },
  );

  assert.equal(llamadoResolver, false);
  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});

test("la estimación rechaza líneas con referencia vacía", async () => {
  let llamadoResolver = false;
  const r = await orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({
      resolverProductos: async () => {
        llamadoResolver = true;
        return { piezas: 0, subtotalCents: 0, descartadas: [] };
      },
    }),
    { estimacion: true, lineas: [{ econoluzReference: "   ", cantidad: 1 }] },
  );

  assert.equal(llamadoResolver, false);
  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});

test("estimarEnvio rechaza directamente líneas inválidas sin consultar productos ni base de datos", async () => {
  const r = await estimarEnvio(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    [{ econoluzReference: "ECO-0001", cantidad: 0 }],
  );

  assert.deepEqual(r, {
    estimacion: true,
    tipo: "carrito_no_comprable",
    referencias: [],
  });
});

