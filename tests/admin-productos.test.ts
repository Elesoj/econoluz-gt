import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCTOS_POR_PAGINA,
  leerProductosAdmin,
  parsearExistencias,
  parsearPrecio,
} from "../app/admin/productos/list";
import { validarPublicacion } from "../app/admin/productos/nuevo";

type Registro = { text: string; params: readonly unknown[] };

/** Query falsa que apunta lo que recibe y devuelve filas controladas. */
function queryFalsa(filas: Record<string, unknown>[], registro: Registro[] = []) {
  return async (text: string, params: readonly unknown[]) => {
    registro.push({ text, params });
    return filas;
  };
}

const FILA = {
  id: "construlita-cuasar",
  econoluz_reference: "ECO-CAT-0007",
  public_name: "Luminaria de prueba",
  product_type: "tiras_led",
  product_type_label: "Tiras LED",
  image: "/catalogos/x/y.jpg",
  price_gtq: "1250.00",
  stock: "4",
  published: true,
  total_filtrado: "313",
};
// La fila lleva solo lo que la consulta del listado selecciona de verdad.
// `sellable_online` sigue existiendo en la base, pero el panel dejó de leerla:
// lo que decide la venta es el precio.

test("los importes de Postgres llegan como números, no como texto", async () => {
  const { productos, total } = await leerProductosAdmin(queryFalsa([FILA]), {});
  assert.equal(productos[0].precio, 1250);
  assert.equal(productos[0].existencias, 4);
  assert.equal(total, 313);
});

test("un producto sin precio ni existencias se distingue de uno con cero", async () => {
  const { productos } = await leerProductosAdmin(
    queryFalsa([{ ...FILA, price_gtq: null, stock: null }]),
    {},
  );
  assert.equal(productos[0].precio, null);
  assert.equal(productos[0].existencias, null);
});

test("lo que escribe el usuario viaja como parámetro, nunca dentro del SQL", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { busqueda: "o'brien'; drop table" });
  const [{ text, params }] = registro;
  assert.equal(text.includes("drop table"), false);
  assert.equal(
    params.some((p) => String(p).includes("o'brien")),
    true,
  );
});

test("la búsqueda mira el nombre, la referencia y el código del fabricante", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { busqueda: "APL-001" });
  const [{ text }] = registro;
  assert.match(text, /public_name/);
  assert.match(text, /econoluz_reference/);
  assert.match(text, /supplier_code/);
});

test("el producto en el listado administrativo incluye el código de fabricante para uso interno", async () => {
  const { productos } = await leerProductosAdmin(
    queryFalsa([{ ...FILA, supplier_code: "PROV-999" }]),
    {},
  );
  assert.equal(productos[0].proveedorCodigo, "PROV-999");
});

test("la tercera página se salta exactamente las dos anteriores", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { pagina: 3 });
  const [{ params }] = registro;
  // Los dos últimos parámetros son, por este orden, el tamaño de página y el
  // desplazamiento.
  assert.deepEqual(params.slice(-2), [PRODUCTOS_POR_PAGINA, PRODUCTOS_POR_PAGINA * 2]);
});

test("una página imposible no rompe la consulta", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { pagina: -3 });
  const [{ params }] = registro;
  assert.equal(params.at(-1), 0);
});

test("el filtro de sin precio no se confunde con precio cero", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { estado: "sin_precio" });
  const [{ text }] = registro;
  assert.match(text, /price_gtq is null/);
});

test("el filtro de incompletos busca productos publicados sin supplier_code", async () => {
  const registro: Registro[] = [];
  await leerProductosAdmin(queryFalsa([], registro), { estado: "incompletos" });
  const [{ text }] = registro;
  assert.match(text, /supplier_code/);
  assert.match(text, /published/);
});

test("leerProductosAdmin devuelve contadores de cada estado sin consultas N+1", async () => {
  const filaConContadores = {
    ...FILA,
    supplier_code: null,
    total_todos: "313",
    total_publicados: "300",
    total_ocultos: "13",
    total_incompletos: "5",
  };
  const resultado = await leerProductosAdmin(queryFalsa([filaConContadores]), {});
  assert.deepEqual(resultado.contadores, {
    todos: 313,
    publicados: 300,
    ocultos: 13,
    incompletos: 5,
  });
  assert.equal(resultado.productos[0].incompleto, true);
  assert.match(resultado.productos[0].motivoIncompleto ?? "", /código/i);
});

test("el precio acepta la forma en que se escribe de verdad", () => {
  assert.deepEqual(parsearPrecio("1250"), { ok: true, valor: 1250 });
  assert.deepEqual(parsearPrecio("1,250.50"), { ok: true, valor: 1250.5 });
  assert.deepEqual(parsearPrecio("Q 1250.00"), { ok: true, valor: 1250 });
  assert.deepEqual(parsearPrecio("  "), { ok: true, valor: null });
});

test("el precio rechaza lo que no es un importe, y lo dice", () => {
  assert.equal(parsearPrecio("-5").ok, false);
  assert.equal(parsearPrecio("gratis").ok, false);
});

test("el precio rechaza el cero y cualquier valor por debajo", () => {
  // Vacío es «todavía sin precio» y es legítimo. Cero no: significaría regalar
  // el producto, y nadie carga un cero queriendo eso. Casi siempre es un dedo.
  assert.equal(parsearPrecio("0").ok, false);
  assert.equal(parsearPrecio("0.00").ok, false);
  assert.equal(parsearPrecio("Q 0").ok, false);
  assert.equal(parsearPrecio("-0.01").ok, false);
});

test("quitar el precio deja el producto sin precio, no a cero", () => {
  // Es la vía para retirar un producto de la venta: se borra el precio y la
  // tarjeta vuelve a «Consultar precio».
  assert.deepEqual(parsearPrecio(""), { ok: true, valor: null });
  assert.deepEqual(parsearPrecio("   "), { ok: true, valor: null });
});

test("las existencias son unidades enteras", () => {
  assert.deepEqual(parsearExistencias("12"), { ok: true, valor: 12 });
  assert.deepEqual(parsearExistencias(""), { ok: true, valor: null });
  assert.equal(parsearExistencias("2.5").ok, false);
  assert.equal(parsearExistencias("-1").ok, false);
});

test("el listado no arrastra el identificador interno del proveedor", async () => {
  // La columna `id` es un texto del estilo "construlita-cuasar": lleva dentro
  // el nombre del fabricante, que es justo lo que no puede salir de aquí.
  const registro: Registro[] = [];
  const { productos } = await leerProductosAdmin(queryFalsa([FILA], registro), {});
  assert.equal("id" in productos[0], false);
  assert.equal(JSON.stringify(productos).includes("construlita"), false);
});

test("el guardado del listado rápido exige código de fabricante si el producto se marca como publicado", () => {
  const sinCodigo = validarPublicacion({ publicado: true, proveedorCodigo: "" });
  assert.equal(sinCodigo.ok, false);
  assert.match(sinCodigo.error, /código del fabricante/i);

  const conCodigo = validarPublicacion({ publicado: true, proveedorCodigo: "PROV-123" });
  assert.equal(conCodigo.ok, true);

  const borradorSinCodigo = validarPublicacion({ publicado: false, proveedorCodigo: "" });
  assert.equal(borradorSinCodigo.ok, true);
});
