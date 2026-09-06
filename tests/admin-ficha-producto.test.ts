import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPOS_FICHA_TECNICA,
  aplicacionesDe,
  fichaTecnicaDesdeFormulario,
  actualizarFichaTecnica,
  normalizarFichaTecnicaLectura,
  resolverAcabado,
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

test("CAMPOS_FICHA_TECNICA contiene lifetime y no lifespan", () => {
  const claves: readonly string[] = CAMPOS_FICHA_TECNICA.map((c) => c.clave);
  assert.equal(claves.includes("lifetime"), true, "Debe contener lifetime");
  assert.equal(claves.includes("lifespan"), false, "No debe contener lifespan");
});

test("normalizarFichaTecnicaLectura convierte lifespan a lifetime y elimina lifespan", () => {
  const specs = { lifespan: "40000", power: "15 W" };
  const normalizada = normalizarFichaTecnicaLectura(specs);
  assert.equal(normalizada.lifetime, "40000");
  assert.equal("lifespan" in normalizada, false);
  assert.equal(normalizada.power, "15 W");
});

test("normalizarFichaTecnicaLectura da prioridad a lifetime si ambos existen", () => {
  const specs = { lifespan: "30000", lifetime: "50000" };
  const normalizada = normalizarFichaTecnicaLectura(specs);
  assert.equal(normalizada.lifetime, "50000");
  assert.equal("lifespan" in normalizada, false);
});

test("actualizarFichaTecnica preserva claves no visibles (amperage, frequency)", () => {
  const preexistente = {
    amperage: "15A",
    frequency: "50/60Hz",
    certification: "NOM",
    power: "10 W",
    lifespan: "40000",
  };

  const camposFormulario = {
    power: "15 W",
    lifetime: "40000",
    warranty: "5 años",
  };

  const resultado = actualizarFichaTecnica(preexistente, camposFormulario, "Característica 1");

  assert.equal(resultado.power, "15 W");
  assert.equal(resultado.lifetime, "40000");
  assert.equal(resultado.warranty, "5 años");
  assert.equal(resultado.amperage, "15A", "amperage debe conservarse");
  assert.equal(resultado.frequency, "50/60Hz", "frequency debe conservarse");
  assert.equal(resultado.certification, "NOM", "certification debe conservarse");
  assert.equal("lifespan" in resultado, false, "lifespan debe eliminarse");
  assert.deepEqual(resultado.specialFeatures, ["Característica 1"]);
});

test("actualizarFichaTecnica elimina únicamente la clave administrada que se vacía deliberadamente", () => {
  const preexistente = {
    amperage: "15A",
    power: "15 W",
    voltage: "120-277 V",
    lifetime: "50000",
  };

  // El usuario vacía voltage y power
  const camposFormulario = {
    power: "   ",
    voltage: "",
    lifetime: "50000",
  };

  const resultado = actualizarFichaTecnica(preexistente, camposFormulario, "");

  assert.equal("power" in resultado, false, "power debe haber sido eliminado");
  assert.equal("voltage" in resultado, false, "voltage debe haber sido eliminado");
  assert.equal(resultado.lifetime, "50000");
  assert.equal(resultado.amperage, "15A", "amperage no visible debe permanecer");
});

test("resolverAcabado con acabado conocido devuelve identificador y etiqueta oficiales", () => {
  const resultado = resolverAcabado("blanco_brillante");
  assert.deepEqual(resultado, {
    ok: true,
    acabado: "blanco_brillante",
    acabadoEtiqueta: "Blanco brillante",
  });
});

test("resolverAcabado con 'otro' y texto personalizado genera slug y conserva etiqueta", () => {
  const resultado = resolverAcabado("otro", "Gris espacial metalizado");
  assert.deepEqual(resultado, {
    ok: true,
    acabado: "gris_espacial_metalizado",
    acabadoEtiqueta: "Gris espacial metalizado",
  });
});

test("resolverAcabado con 'otro' pero texto vacío devuelve error", () => {
  const resultado = resolverAcabado("otro", "   ");
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.match(resultado.error, /acabado/i);
  }
});

test("resolverAcabado con 'sin_especificar' o vacío devuelve cadenas vacías válidas", () => {
  assert.deepEqual(resolverAcabado("sin_especificar"), {
    ok: true,
    acabado: "",
    acabadoEtiqueta: "",
  });
  assert.deepEqual(resolverAcabado(""), {
    ok: true,
    acabado: "",
    acabadoEtiqueta: "",
  });
});

test("reparación idempotente de ECO-ELE-0001 restaura specs y normaliza lifetime", () => {
  // Estado degradado de ECO-ELE-0001 (APL-001) tras haber sido editado previamente:
  const estadoDegradado = {
    power: "15 W",
    lifespan: "40000",
    warranty: "5 años",
  };

  // Al simular la lógica de reparación / guardado con actualización:
  const restaurado = actualizarFichaTecnica(
    estadoDegradado,
    {
      power: "15 W",
      lifetime: "40000",
      warranty: "5 años",
    },
    "",
  );

  // Restaurar claves históricas no visibles
  restaurado.amperage = "15A";
  restaurado.frequency = "50/60Hz";

  assert.equal(restaurado.lifetime, "40000");
  assert.equal("lifespan" in restaurado, false);
  assert.equal(restaurado.amperage, "15A");
  assert.equal(restaurado.frequency, "50/60Hz");
  assert.equal(restaurado.warranty, "5 años");

  // Al actualizar nuevamente (idempotencia)
  const reaplicado = actualizarFichaTecnica(
    restaurado,
    {
      lifetime: "40000",
      warranty: "5 años",
    },
    "",
  );

  assert.equal(reaplicado.lifetime, "40000");
  assert.equal("lifespan" in reaplicado, false);
  assert.equal(reaplicado.amperage, "15A");
  assert.equal(reaplicado.frequency, "50/60Hz");
  assert.equal(reaplicado.warranty, "5 años");
});
