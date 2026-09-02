import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAVES_NUMERICAS,
  categoriasDelCatalogo,
  numeroEstricto,
  planificarProducto,
  slugDeCategoria,
  type FilaDeCatalogo,
} from "../app/data/catalogo/importacion";

/**
 * La traducción del catálogo actual al modelo relacional, probada sin base de datos.
 *
 * Lo que más importa aquí no es lo que convierte, sino lo que **se niega** a convertir: el
 * catálogo real trae rangos («5-8 anos») y familias de producto («75 W / 100 W / 150 W»)
 * que, leídos a la ligera, se convierten en un número con una unidad inventada. Eso no es
 * una importación incompleta: es un dato corrupto que después nadie distingue del bueno.
 */

const FILA: FilaDeCatalogo = {
  id: "apl-001",
  econoluz_reference: "ECO-0001",
  position: 10,
  public_name: "Módulo eléctrico apagador",
  public_description: "Módulo apagador de un interruptor.",
  image: "/catalogos/electrico/apl-001.png",
  images: null,
  technical_specs: null,
  product_type: "placas_accesorios",
  product_type_label: "Placas y accesorios",
  application: "placas_apagadores",
  application_label: "Placas y apagadores",
  finish: "blanco_brillante",
  finish_label: "Blanco brillante",
  family_label: "Artlite",
  supplier_brand: "artlite",
  supplier_brand_label: "Artlite",
  supplier_series: "linea_artlite",
  supplier_series_label: "Línea Artlite",
  supplier_code: "APL-001",
  supplier_name: "Modulo apagador ARTLITE APL-001",
  supplier_description: "Modulo apagador de 1 interruptor.",
  price_gtq: null,
  published: true,
};

// ---------------------------------------------------------------------------
// El test numérico
// ---------------------------------------------------------------------------

test("numeroEstricto acepta un número con una unidad corta", () => {
  assert.deepEqual(numeroEstricto("15A"), { numero: 15, unidad: "A" });
  assert.deepEqual(numeroEstricto("0.78A"), { numero: 0.78, unidad: "A" });
  assert.deepEqual(numeroEstricto("75%"), { numero: 75, unidad: "%" });
  assert.deepEqual(numeroEstricto("87 g"), { numero: 87, unidad: "g" });
  assert.deepEqual(numeroEstricto("0.025 seg."), { numero: 0.025, unidad: "seg." });
});

test("numeroEstricto acepta un número sin unidad", () => {
  assert.deepEqual(numeroEstricto("80"), { numero: 80, unidad: null });
});

test("numeroEstricto entiende el separador de millares del catálogo", () => {
  assert.deepEqual(numeroEstricto("12 250 lm"), { numero: 12250, unidad: "lm" });
});

test("numeroEstricto rechaza un rango, porque un rango no es un número", () => {
  // «5-8 anos» leído a la ligera da 5 con la unidad «-8 anos». Ese es el fallo concreto
  // que esta prueba existe para impedir.
  assert.equal(numeroEstricto("5-8 anos"), null);
  assert.equal(numeroEstricto("6-8 horas"), null);
  assert.equal(numeroEstricto("3-6 m"), null);
});

test("numeroEstricto rechaza una familia de valores", () => {
  assert.equal(numeroEstricto("75 W / 100 W / 150 W / 200 W"), null);
  assert.equal(numeroEstricto("4 000 K / 5 000 K"), null);
});

test("numeroEstricto rechaza una unidad con dígitos o con dos puntos", () => {
  assert.equal(numeroEstricto("5V Max. 2.1A"), null);
  assert.equal(numeroEstricto("200 W: 200/150/120 W"), null);
});

test("numeroEstricto rechaza lo aproximado y lo vacío", () => {
  assert.equal(numeroEstricto(">80"), null);
  assert.equal(numeroEstricto("Dimerizable"), null);
  assert.equal(numeroEstricto(""), null);
});

test("las claves numéricas aprobadas son exactamente siete", () => {
  assert.deepEqual([...CLAVES_NUMERICAS].sort(), [
    "amperage",
    "cutout",
    "disconnectSpeed",
    "panelLifetime",
    "savings",
    "shortCircuitCurrent",
    "weight",
  ]);
});

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

test("el slug de una hoja lleva su tipo, porque una aplicación cuelga de dos", () => {
  // `decorativos` existe bajo arquitectónica y bajo exterior, y `categories.slug` es único
  // en toda la tabla: con el slug simple, la importación reventaría en el producto catorce.
  assert.equal(
    slugDeCategoria("iluminacion_exterior", "decorativos"),
    "iluminacion-exterior-decorativos",
  );
  assert.notEqual(
    slugDeCategoria("iluminacion_exterior", "decorativos"),
    slugDeCategoria("iluminacion_arquitectonica", "decorativos"),
  );
});

test("el slug de una raíz es solo su tipo", () => {
  assert.equal(slugDeCategoria("iluminacion_exterior"), "iluminacion-exterior");
});

test("categoriasDelCatalogo devuelve la raíz antes que su hoja", () => {
  const categorias = categoriasDelCatalogo([FILA]);
  assert.deepEqual(
    categorias.map((categoria) => [categoria.slug, categoria.parentSlug]),
    [
      ["placas-accesorios", null],
      ["placas-accesorios-placas-apagadores", "placas-accesorios"],
    ],
  );
});

test("categoriasDelCatalogo no repite una raíz compartida por dos hojas", () => {
  const otra: FilaDeCatalogo = {
    ...FILA,
    id: "apl-002",
    application: "contactos",
    application_label: "Contactos",
  };
  const categorias = categoriasDelCatalogo([FILA, otra]);
  const raices = categorias.filter((categoria) => categoria.parentSlug === null);
  assert.equal(raices.length, 1);
  assert.equal(categorias.length, 3);
});

test("categoriasDelCatalogo distingue dos hojas homónimas de padres distintos", () => {
  const arquitectonica: FilaDeCatalogo = {
    ...FILA,
    id: "uno",
    product_type: "iluminacion_arquitectonica",
    product_type_label: "Iluminación arquitectónica",
    application: "decorativos",
    application_label: "Decorativos",
  };
  const exterior: FilaDeCatalogo = {
    ...arquitectonica,
    id: "dos",
    product_type: "iluminacion_exterior",
    product_type_label: "Iluminación exterior",
  };
  const slugs = categoriasDelCatalogo([arquitectonica, exterior]).map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "ningún slug puede repetirse");
});

// ---------------------------------------------------------------------------
// El plan de un producto
// ---------------------------------------------------------------------------

test("el producto pertenece a su hoja y esa hoja es la principal", () => {
  const plan = planificarProducto(FILA);
  assert.deepEqual(plan.categorias, [
    { slug: "placas-accesorios-placas-apagadores", principal: true },
  ]);
});

test("la primera imagen es la principal y la galería va detrás", () => {
  const plan = planificarProducto({ ...FILA, image: "/a.png", images: ["/b.png", "/c.png"] });
  assert.deepEqual(
    plan.imagenes.map((imagen) => [imagen.url, imagen.posicion, imagen.principal]),
    [
      ["/a.png", 0, true],
      ["/b.png", 10, false],
      ["/c.png", 20, false],
    ],
  );
});

test("la imagen hereda el nombre público como texto alternativo", () => {
  const plan = planificarProducto(FILA);
  assert.equal(plan.imagenes[0].alt, FILA.public_name);
  assert.equal(plan.imagenes[0].visible, true);
});

test("una galería que repite la imagen principal no la duplica", () => {
  const plan = planificarProducto({ ...FILA, image: "/a.png", images: ["/a.png", "/b.png"] });
  assert.deepEqual(
    plan.imagenes.map((imagen) => imagen.url),
    ["/a.png", "/b.png"],
  );
});

test("solo se normalizan las claves aprobadas, y el resto se queda en el JSON", () => {
  const plan = planificarProducto({
    ...FILA,
    technical_specs: {
      amperage: "15A",
      power: "75 W / 100 W / 150 W",
      specialFeatures: ["GFCI", "Blanco brillante"],
    },
  });
  assert.deepEqual(
    plan.atributos.map((atributo) => [atributo.clave, atributo.numero, atributo.unidad]),
    [["amperage", 15, "A"]],
  );
});

test("las siete claves usan exactamente las unidades canónicas aprobadas", () => {
  const technicalSpecs = {
    amperage: "15A",
    savings: "75%",
    panelLifetime: "25 anos",
    disconnectSpeed: "0.025 seg.",
    shortCircuitCurrent: "10 kA",
    weight: "87 g",
    cutout: "75 mm",
    power: "75 W / 100 W",
  };

  const plan = planificarProducto({ ...FILA, technical_specs: technicalSpecs });

  assert.deepEqual(
    plan.atributos.map(({ clave, unidad }) => [clave, unidad]),
    [
      ["amperage", "A"],
      ["savings", "%"],
      ["panel_lifetime", "años"],
      ["disconnect_speed", "segundos"],
      ["short_circuit_current", "kA"],
      ["weight", "g"],
      ["cutout", "mm"],
    ],
  );
  assert.equal(technicalSpecs.panelLifetime, "25 anos", "el valor original se conserva");
  assert.equal(technicalSpecs.disconnectSpeed, "0.025 seg.", "el valor original se conserva");
  assert.equal(technicalSpecs.power, "75 W / 100 W", "lo ambiguo no se transforma");
});

test("una clave aprobada con un valor que no es número no se importa", () => {
  // La lista aprobada dice qué claves mirar; el test numérico dice si el valor sirve. Si
  // alguien edita `amperage` en el panel y escribe «15-20A», eso no entra como número.
  const plan = planificarProducto({ ...FILA, technical_specs: { amperage: "15-20A" } });
  assert.deepEqual(plan.atributos, []);
  assert.deepEqual(plan.rechazos, [
    { clave: "amperage", valor: "15-20A", motivo: "no es un número con unidad simple" },
  ]);
});

test("los siete datos privados viajan enteros y ni uno más", () => {
  const plan = planificarProducto(FILA);
  assert.deepEqual(Object.keys(plan.privados).sort(), [
    "supplier_brand",
    "supplier_brand_label",
    "supplier_code",
    "supplier_description",
    "supplier_name",
    "supplier_series",
    "supplier_series_label",
  ]);
  assert.equal(plan.privados.supplier_code, "APL-001");
});

test("un precio en quetzales se convierte a centavos enteros", () => {
  const plan = planificarProducto({ ...FILA, price_gtq: 1299.5 });
  assert.equal(plan.precioNormalCentavos, 129950);
});

test("un producto sin precio no genera ninguna fila de precio", () => {
  assert.equal(planificarProducto(FILA).precioNormalCentavos, null);
});

test("un precio de cero o negativo no es un precio", () => {
  // La regla del catálogo desde el 26/08/2026: tener precio es estar a la venta. Un cero
  // que llegara a `product_prices` pondría el producto a la venta por nada.
  assert.equal(planificarProducto({ ...FILA, price_gtq: 0 }).precioNormalCentavos, null);
  assert.equal(planificarProducto({ ...FILA, price_gtq: -5 }).precioNormalCentavos, null);
});

test("el plan no arrastra ningún dato del proveedor a la parte pública", () => {
  const plan = planificarProducto(FILA);
  const publico = JSON.stringify({
    categorias: plan.categorias,
    imagenes: plan.imagenes,
    atributos: plan.atributos,
  });
  for (const secreto of ["APL-001", "Artlite", "artlite"]) {
    assert.ok(!publico.includes(secreto), `«${secreto}» no puede salir del ámbito privado`);
  }
});
