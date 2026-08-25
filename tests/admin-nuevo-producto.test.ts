import assert from "node:assert/strict";
import { test } from "node:test";
import {
  construirReferencia,
  crearProducto,
  prefijoSugerido,
  validarPrefijo,
} from "../app/admin/productos/nuevo";

type Registro = { text: string; params: readonly unknown[] };

/**
 * Query falsa que responde a cada consulta del alta en el orden en que se
 * hacen: primero el número de referencia, después la última posición.
 */
function queryFalsa(registro: Registro[] = []) {
  const respuestas: Record<string, unknown>[][] = [
    [{ numero: "314" }],
    [{ ultima: "3130" }],
    [],
  ];
  let llamada = 0;
  return async (text: string, params: readonly unknown[]) => {
    registro.push({ text, params });
    return respuestas[llamada++] ?? [];
  };
}

test("cada tipo propone el prefijo que ya usan sus productos", () => {
  assert.equal(prefijoSugerido("placas_accesorios"), "ELE");
  assert.equal(prefijoSugerido("iluminacion_industrial"), "IND");
  assert.equal(prefijoSugerido("sistemas_lineales_tubos"), "TUB");
  assert.equal(prefijoSugerido("tiras_led"), "CAT");
  assert.equal(prefijoSugerido("cualquier_cosa"), "CAT");
});

test("la referencia lleva el número a cuatro cifras", () => {
  assert.equal(construirReferencia("TUB", 314), "ECO-TUB-0314");
  assert.equal(construirReferencia("cat", 7), "ECO-CAT-0007");
  assert.equal(construirReferencia("ELE", 12345), "ECO-ELE-12345");
});

test("el prefijo solo admite letras, y se guarda en mayúsculas", () => {
  assert.deepEqual(validarPrefijo(" tub "), { ok: true, valor: "TUB" });
  assert.equal(validarPrefijo("ECO-1").ok, false);
  assert.equal(validarPrefijo("").ok, false);
  assert.equal(validarPrefijo("DEMASIADOLARGO").ok, false);
});

test("el producto nuevo se coloca al final del catálogo", async () => {
  const registro: Registro[] = [];
  await crearProducto(queryFalsa(registro), {
    prefijo: "CAT",
    nombre: "Producto nuevo",
    descripcion: "",
    imagen: "/catalogos/x/y.webp",
    tipo: "tiras_led",
    tipoEtiqueta: "Tiras LED",
    aplicacion: "tiras",
    aplicacionEtiqueta: "Tiras",
    familia: "",
    fichaTecnica: {},
    publicado: false,
  });

  const insercion = registro.at(-1);
  assert.ok(insercion);
  // La última posición usada era 3130, así que el nuevo va diez más allá.
  assert.equal(insercion.params.includes(3140), true);
});

test("el identificador interno se construye con la referencia, no con la marca", async () => {
  const registro: Registro[] = [];
  const referencia = await crearProducto(queryFalsa(registro), {
    prefijo: "TUB",
    nombre: "Producto nuevo",
    descripcion: "",
    imagen: "/catalogos/x/y.webp",
    tipo: "sistemas_lineales_tubos",
    tipoEtiqueta: "Sistemas lineales y tubos",
    aplicacion: "perfiles",
    aplicacionEtiqueta: "Perfiles",
    familia: "",
    fichaTecnica: {},
    publicado: false,
  });

  assert.equal(referencia, "ECO-TUB-0314");
  const insercion = registro.at(-1);
  assert.equal(insercion?.params.includes("eco-tub-0314"), true);
});

test("un catálogo vacío no rompe el cálculo de la posición", async () => {
  const registro: Registro[] = [];
  const respuestas: Record<string, unknown>[][] = [[{ numero: "1" }], [{ ultima: null }], []];
  let llamada = 0;
  await crearProducto(
    async (text, params) => {
      registro.push({ text, params });
      return respuestas[llamada++] ?? [];
    },
    {
      prefijo: "CAT",
      nombre: "Primero",
      descripcion: "",
      imagen: "/x.webp",
      tipo: "tiras_led",
      tipoEtiqueta: "Tiras LED",
      aplicacion: "tiras",
      aplicacionEtiqueta: "Tiras",
      familia: "",
      fichaTecnica: {},
      publicado: false,
    },
  );
  assert.equal(registro.at(-1)?.params.includes(10), true);
});
