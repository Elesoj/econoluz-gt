import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPOS_FICHA_TECNICA,
  aplicacionesDe,
  fichaTecnicaDesdeFormulario,
  leerProductoPorReferencia,
  lineasDesdeLista,
  validarFichaProducto,
} from "../app/admin/productos/ficha";

const VALIDO = {
  nombre: "Panel de prueba",
  descripcion: "Una descripción suficiente para el catálogo.",
  imagen: "/catalogos/x/y.webp",
  tipo: "iluminacion_arquitectonica",
  aplicacion: "downlights",
  acabado: "blanco",
  acabadoEtiqueta: "Blanco",
  familia: "Serie de prueba",
};

test("la aplicación tiene que pertenecer al tipo elegido", () => {
  const resultado = validarFichaProducto({ ...VALIDO, aplicacion: "vialidades" });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.errores.join(" "), /aplicación/i);
});

test("una combinación correcta de tipo y aplicación pasa", () => {
  const resultado = validarFichaProducto(VALIDO);
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.datos.tipoEtiqueta, "Iluminación arquitectónica");
  assert.equal(resultado.datos.aplicacionEtiqueta, "Downlights");
});

test("las etiquetas visibles no se escriben a mano: salen de la taxonomía", () => {
  // Si se pudieran teclear, el catálogo guiado mostraría dos nombres distintos
  // para la misma categoría y el filtro dejaría de encontrar el producto.
  const resultado = validarFichaProducto({ ...VALIDO, tipo: "tiras_led", aplicacion: "perfiles" });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.datos.tipoEtiqueta, "Tiras LED");
});

test("un nombre vacío o una imagen vacía se rechazan", () => {
  assert.equal(validarFichaProducto({ ...VALIDO, nombre: "   " }).ok, false);
  assert.equal(validarFichaProducto({ ...VALIDO, imagen: "" }).ok, false);
});

test("un tipo inventado se rechaza sin reventar", () => {
  const resultado = validarFichaProducto({ ...VALIDO, tipo: "no_existe" });
  assert.equal(resultado.ok, false);
});

test("cada tipo ofrece solo sus aplicaciones", () => {
  assert.equal(aplicacionesDe("tiras_led").length, 3);
  assert.equal(
    aplicacionesDe("iluminacion_industrial").some((a) => a.id === "alto_montaje"),
    true,
  );
  assert.deepEqual(aplicacionesDe("no_existe"), []);
});

test("la ficha técnica guarda solo los campos rellenados", () => {
  const ficha = fichaTecnicaDesdeFormulario(
    { power: "35 W", voltage: "", cri: "  ", protection: "IP65" },
    "",
  );
  assert.deepEqual(ficha, { power: "35 W", protection: "IP65" });
});

test("las características especiales se guardan como lista, una por renglón", () => {
  const ficha = fichaTecnicaDesdeFormulario(
    { power: "35 W" },
    "Montaje en riel\n\nDriver remoto no incluido\n  Acabado negro  ",
  );
  assert.deepEqual(ficha.specialFeatures, [
    "Montaje en riel",
    "Driver remoto no incluido",
    "Acabado negro",
  ]);
});

test("una lista guardada vuelve al formulario como renglones", () => {
  assert.equal(lineasDesdeLista(["Uno", "Dos"]), "Uno\nDos");
  assert.equal(lineasDesdeLista(undefined), "");
  assert.equal(lineasDesdeLista("Texto suelto"), "Texto suelto");
});

test("los campos de ficha técnica que se ofrecen son los que de verdad se usan", () => {
  const claves: string[] = CAMPOS_FICHA_TECNICA.map((campo) => campo.clave);
  for (const esperada of ["power", "voltage", "colorTemperature", "protection", "dimensions"]) {
    assert.equal(claves.includes(esperada), true, `falta ${esperada}`);
  }
  // `specialFeatures` es una lista y se edita aparte, no como campo suelto.
  assert.equal(claves.includes("specialFeatures"), false);
});

test("un producto sin galería ni ficha técnica se lee sin huecos", async () => {
  const producto = await leerProductoPorReferencia(
    async () => [
      {
        econoluz_reference: "ECO-CAT-0007",
        public_name: "Panel",
        images: null,
        technical_specs: null,
        price_gtq: null,
        stock: null,
        published: true,
      },
    ],
    "ECO-CAT-0007",
  );
  assert.deepEqual(producto?.galeria, []);
  assert.deepEqual(producto?.fichaTecnica, {});
  assert.equal(producto?.precio, null);
  assert.equal(producto?.publicado, true);
});

test("una referencia que no existe devuelve null, no un producto vacío", async () => {
  assert.equal(await leerProductoPorReferencia(async () => [], "ECO-NO-9999"), null);
});
