import assert from "node:assert/strict";
import { test } from "node:test";

import { ErrorDeDatos } from "../app/lib/datos/errores";
import type { Ejecutor } from "../app/lib/datos/consulta";
import {
  aplicarProducto,
  crearAtributo,
  crearOpcion,
  editarAtributo,
  guardarProductoCon,
  retirarAtributo,
  retirarOpcion,
  type EntradaDeProducto,
} from "../app/data/catalogo/escritura";

/**
 * El contrato de escritura del diseño §4, probado con un ejecutor de mentira.
 *
 * No hace falta base de datos para comprobar lo que más importa: **el orden**. Guardar un
 * precio normal nuevo sin cerrar antes el anterior deja dos vigentes a la vez, y reconstruir
 * la proyección pública antes de sincronizar las imágenes publica una versión que no
 * corresponde a la fuente de verdad. Las dos cosas son invisibles hasta que alguien mira el
 * precio equivocado en el catálogo.
 */

type Sentencia = { texto: string; parametros: readonly unknown[] };
type Respuesta = { patron: RegExp; filas: Record<string, unknown>[] };

function ejecutorFalso(respuestas: readonly Respuesta[] = []) {
  const sentencias: Sentencia[] = [];
  const ejecutar: Ejecutor = async (texto, parametros = []) => {
    sentencias.push({ texto, parametros });
    return respuestas.find((respuesta) => respuesta.patron.test(texto))?.filas ?? [];
  };
  return { ejecutar, sentencias };
}

const indiceDe = (sentencias: readonly Sentencia[], patron: RegExp) =>
  sentencias.findIndex((sentencia) => patron.test(sentencia.texto));

const ENTRADA: EntradaDeProducto = {
  id: "apl-001",
  nucleo: {
    econoluz_reference: "ECO-0001",
    position: 10,
    public_name: "Módulo eléctrico apagador",
    public_description: "Módulo apagador de un interruptor.",
    image: "/catalogos/electrico/apl-001.png",
    images: null,
    technical_specs: { amperage: "15A" },
    product_type: "placas_accesorios",
    product_type_label: "Placas y accesorios",
    application: "placas_apagadores",
    application_label: "Placas y apagadores",
    finish: "blanco_brillante",
    finish_label: "Blanco brillante",
    family_label: "Placas",
    published: true,
  },
  privados: {
    supplier_brand: "artlite",
    supplier_brand_label: "Artlite",
    supplier_series: "linea_artlite",
    supplier_series_label: "Línea Artlite",
    supplier_code: "APL-001",
    supplier_name: "Modulo apagador ARTLITE APL-001",
    supplier_description: "Modulo apagador de 1 interruptor.",
  },
  categorias: [{ categoriaId: "7", principal: true }],
  imagenes: [
    {
      url: "/catalogos/electrico/apl-001.png",
      alt: "Módulo eléctrico apagador",
      posicion: 0,
      visible: true,
      principal: true,
    },
  ],
  atributos: [
    { atributoId: "1", tipo: "numero", asignacion: { clase: "escalar", valor: 15 } },
  ],
  precioNormalCentavos: null,
  actor: { tipo: "sistema", id: "importador" },
};

// ---------------------------------------------------------------------------
// Validar antes de tocar nada
// ---------------------------------------------------------------------------

test("dos categorías principales se rechazan antes de escribir una sola sentencia", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      categorias: [
        { categoriaId: "7", principal: true },
        { categoriaId: "8", principal: true },
      ],
    }),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "conflicto",
  );
  assert.equal(sentencias.length, 0, "una entrada inválida no puede dejar rastro");
});

test("categorías sin ninguna principal también se rechazan", async () => {
  const { ejecutar } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      categorias: [{ categoriaId: "7", principal: false }],
    }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
});

test("un producto publicado sin imagen principal visible se rechaza", async () => {
  // Es la regla del diseño §3.5 que el esquema no puede expresar: depende de `published`,
  // que cambia con el tiempo, y de que la imagen principal esté además visible.
  const { ejecutar, sentencias } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, { ...ENTRADA, imagenes: [] }),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "conflicto",
  );
  assert.equal(sentencias.length, 0);
});

test("una imagen principal oculta no sirve para publicar", async () => {
  const { ejecutar } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      imagenes: [{ ...ENTRADA.imagenes[0], visible: false }],
    }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
});

test("un producto sin publicar sí puede quedarse sin imágenes", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, {
    ...ENTRADA,
    nucleo: { ...ENTRADA.nucleo, published: false },
    imagenes: [],
  });
  assert.ok(sentencias.length > 0);
});

test("un valor que no corresponde al tipo del atributo se rechaza", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      atributos: [
        { atributoId: "1", tipo: "numero", asignacion: { clase: "escalar", valor: "15A" } },
      ],
    }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
  assert.equal(sentencias.length, 0);
});

test("una opción desactivada ya asignada puede conservarse al guardar", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from product_attribute_values/i,
      filas: [
        {
          id: "9",
          attribute_id: "1",
          attribute_type: "opcion",
          value_number: null,
          value_text: null,
          value_bool: null,
          option_id: "20",
        },
      ],
    },
  ]);

  await aplicarProducto(ejecutar, {
    ...ENTRADA,
    atributos: [
      {
        atributoId: "1",
        tipo: "opcion",
        asignacion: {
          clase: "opcion",
          opcion: { id: "20", atributoId: "1", activa: false },
        },
      },
    ],
  });

  assert.equal(indiceDe(sentencias, /insert into product_attribute_values/i), -1);
  assert.equal(indiceDe(sentencias, /update product_attribute_values/i), -1);
});

test("una opción desactivada nueva se rechaza antes de emitir escrituras", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();

  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      atributos: [
        {
          atributoId: "1",
          tipo: "opcion",
          asignacion: {
            clase: "opcion",
            opcion: { id: "20", atributoId: "1", activa: false },
          },
        },
      ],
    }),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "conflicto",
  );

  assert.ok(
    sentencias.every((sentencia) => !/^\s*(insert|update|delete)\b/i.test(sentencia.texto)),
    "puede consultar el valor histórico, pero no modificar nada",
  );
});

test("el motivo concreto viaja en la causa y no en el mensaje", async () => {
  // `ErrorDeDatos` nunca arrastra el detalle al mensaje, que puede acabar en una respuesta.
  const { ejecutar } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, { ...ENTRADA, imagenes: [] }),
    (error: unknown) => {
      assert.ok(error instanceof ErrorDeDatos);
      assert.ok(!error.message.includes("imagen"), "el mensaje es genérico");
      assert.match(String((error.cause as Error).message), /imagen principal/i);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// El orden del diseño §4
// ---------------------------------------------------------------------------

test("el núcleo se escribe antes que los datos privados", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  assert.ok(
    indiceDe(sentencias, /insert into products/i) <
      indiceDe(sentencias, /insert into product_private_data/i),
  );
});

test("la proyección pública se reconstruye después de sincronizar los satélites", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  const proyeccion = indiceDe(sentencias, /public_products/i);
  assert.ok(proyeccion > indiceDe(sentencias, /product_images/i));
  assert.ok(proyeccion > indiceDe(sentencias, /product_categories/i));
  assert.ok(proyeccion > indiceDe(sentencias, /product_attribute_values/i));
});

test("la auditoría es lo último que se escribe", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  const auditoria = indiceDe(sentencias, /insert into audit_log/i);
  assert.ok(auditoria >= 0, "cada guardado deja una fila de auditoría");
  assert.equal(auditoria, sentencias.length - 1);
});

test("la caché se invalida solo después de confirmar la transacción", async () => {
  const sucesos: string[] = [];
  const { ejecutar } = ejecutorFalso();
  const escribirSimulado = async (trabajo: (ejecutor: Ejecutor) => Promise<void>) => {
    sucesos.push("begin");
    await trabajo(ejecutar);
    sucesos.push("commit");
  };

  await guardarProductoCon(
    escribirSimulado,
    () => {
      sucesos.push("invalidar");
    },
    ENTRADA,
  );

  assert.deepEqual(sucesos, ["begin", "commit", "invalidar"]);
});

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

test("un precio normal nuevo cierra la vigencia del anterior antes de insertar", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from product_prices/i, filas: [{ id: "5", centavos: "100000", tipo: "normal", desde: new Date("2026-01-01"), hasta: null }] },
  ]);
  await aplicarProducto(ejecutar, { ...ENTRADA, precioNormalCentavos: 129900 });

  const cierre = indiceDe(sentencias, /update product_prices/i);
  const alta = indiceDe(sentencias, /insert into product_prices/i);
  assert.ok(cierre >= 0, "hay que cerrar el normal anterior");
  assert.ok(alta > cierre, "el alta va después del cierre, en la misma transacción");
});

test("sin precio normal anterior no se cierra nada, solo se inserta", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, { ...ENTRADA, precioNormalCentavos: 129900 });
  assert.equal(indiceDe(sentencias, /update product_prices/i), -1);
  assert.ok(indiceDe(sentencias, /insert into product_prices/i) >= 0);
});

test("repetir el mismo precio no escribe ninguna fila de precio", async () => {
  // Idempotencia: volver a guardar lo mismo no puede generar una vigencia nueva cada vez,
  // o el histórico de precios se llena de filas idénticas encadenadas.
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from product_prices/i, filas: [{ id: "5", centavos: "129900", tipo: "normal", desde: new Date("2026-01-01"), hasta: null }] },
  ]);
  await aplicarProducto(ejecutar, { ...ENTRADA, precioNormalCentavos: 129900 });
  assert.equal(indiceDe(sentencias, /insert into product_prices/i), -1);
  assert.equal(indiceDe(sentencias, /update product_prices/i), -1);
});

test("un producto sin precio no toca la tabla de precios", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from product_prices/i, filas: [{ id: "5", centavos: "129900", tipo: "normal", desde: new Date("2026-01-01"), hasta: null }] },
  ]);
  await aplicarProducto(ejecutar, ENTRADA);
  assert.equal(indiceDe(sentencias, /insert into product_prices/i), -1);
  assert.equal(
    indiceDe(sentencias, /update product_prices/i),
    -1,
    "quitar el precio del panel no borra el histórico ni cierra vigencias por su cuenta",
  );
});

test("un precio negativo o con decimales de centavo se rechaza", async () => {
  for (const centavos of [-1, 129900.5]) {
    const { ejecutar, sentencias } = ejecutorFalso();
    await assert.rejects(
      aplicarProducto(ejecutar, { ...ENTRADA, precioNormalCentavos: centavos }),
      (error: unknown) => error instanceof ErrorDeDatos,
    );
    assert.equal(sentencias.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Privacidad
// ---------------------------------------------------------------------------

test("la proyección pública no lleva ningún dato del proveedor", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);

  const proyeccion = sentencias.find((sentencia) => /public_products/i.test(sentencia.texto));
  assert.ok(proyeccion);
  const enviado = JSON.stringify(proyeccion.parametros);
  for (const secreto of ["APL-001", "Artlite", "artlite", "ARTLITE"]) {
    assert.ok(!enviado.includes(secreto), `«${secreto}» no puede llegar a public_products`);
  }
});

test("los datos del proveedor sí llegan a la tabla privada", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  const privados = sentencias.find((sentencia) =>
    /insert into product_private_data/i.test(sentencia.texto),
  );
  assert.ok(privados);
  assert.ok(JSON.stringify(privados.parametros).includes("APL-001"));
});

test("un producto despublicado se retira de la proyección en vez de actualizarse", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, {
    ...ENTRADA,
    nucleo: { ...ENTRADA.nucleo, published: false },
  });
  const retirada = sentencias.find((s) => /delete from public_products/i.test(s.texto));
  assert.ok(retirada);
  assert.deepEqual(
    retirada.parametros,
    [ENTRADA.nucleo.econoluz_reference.toLowerCase()],
    "public_products se identifica por la referencia pública, no por products.id",
  );
  assert.ok(!sentencias.some((s) => /insert into public_products/i.test(s.texto)));
});

// ---------------------------------------------------------------------------
// Idempotencia de los satélites
// ---------------------------------------------------------------------------

test("una imagen que ya está igual no se reescribe", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from product_images/i,
      filas: [
        {
          id: "3",
          url: "/catalogos/electrico/apl-001.png",
          alt: "Módulo eléctrico apagador",
          posicion: 0,
          visible: true,
          principal: true,
        },
      ],
    },
  ]);
  await aplicarProducto(ejecutar, ENTRADA);
  assert.equal(indiceDe(sentencias, /insert into product_images/i), -1);
  assert.equal(indiceDe(sentencias, /update product_images/i), -1);
});

test("una imagen que ya no está en el producto se retira", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from product_images/i,
      filas: [
        {
          id: "3",
          url: "/catalogos/electrico/apl-001.png",
          alt: "Módulo eléctrico apagador",
          posicion: 0,
          visible: true,
          principal: true,
        },
        { id: "4", url: "/vieja.png", alt: "", posicion: 10, visible: true, principal: false },
      ],
    },
  ]);
  await aplicarProducto(ejecutar, ENTRADA);
  const borrado = sentencias.find((s) => /delete from product_images/i.test(s.texto));
  assert.ok(borrado);
  assert.ok(JSON.stringify(borrado.parametros).includes("4"));
});

test("una categoría que ya está igual no se reescribe", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from product_categories/i, filas: [{ category_id: "7", principal: true }] },
  ]);
  await aplicarProducto(ejecutar, ENTRADA);
  assert.equal(indiceDe(sentencias, /insert into product_categories/i), -1);
});

test("un valor de atributo que ya está igual no se reescribe", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from product_attribute_values/i,
      filas: [
        {
          id: "9",
          attribute_id: "1",
          attribute_type: "numero",
          value_number: "15",
          value_text: null,
          value_bool: null,
          option_id: null,
        },
      ],
    },
  ]);
  await aplicarProducto(ejecutar, ENTRADA);
  assert.equal(indiceDe(sentencias, /insert into product_attribute_values/i), -1);
});

// ---------------------------------------------------------------------------
// Definiciones de atributos y opciones
// ---------------------------------------------------------------------------

test("un atributo sin usar se bloquea, se cuenta y se borra", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from attributes[\s\S]*for update/i, filas: [{ id: "1" }] },
    { patron: /count[\s\S]*product_attribute_values/i, filas: [{ usos: 0 }] },
  ]);

  assert.equal(await retirarAtributo(ejecutar, "1"), "borrado");
  assert.ok(indiceDe(sentencias, /for update/i) < indiceDe(sentencias, /count/i));
  assert.ok(indiceDe(sentencias, /count/i) < indiceDe(sentencias, /delete from attributes/i));
});

test("un atributo usado solo se desactiva y conserva su clave", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from attributes[\s\S]*for update/i, filas: [{ id: "1" }] },
    { patron: /count[\s\S]*product_attribute_values/i, filas: [{ usos: 7 }] },
  ]);

  assert.equal(await retirarAtributo(ejecutar, "1"), "desactivado");
  assert.equal(indiceDe(sentencias, /delete from attributes/i), -1);
  assert.ok(indiceDe(sentencias, /update attributes set active = false/i) >= 0);
});

test("editar un atributo no acepta ni escribe el tipo", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await editarAtributo(ejecutar, "1", {
    nombre: "Potencia nominal",
    unidad: "W",
    filterable: true,
    comparable: true,
  });

  assert.doesNotMatch(sentencias[0].texto, /\btipo\b/i);
  assert.deepEqual(sentencias[0].parametros, ["1", "Potencia nominal", "W", true, true]);
});

test("crear un atributo devuelve el identificador asignado", async () => {
  const { ejecutar } = ejecutorFalso([
    { patron: /insert into attributes/i, filas: [{ id: "12" }] },
  ]);
  assert.equal(
    await crearAtributo(ejecutar, {
      clave: "potencia_nominal",
      nombre: "Potencia nominal",
      tipo: "numero",
      unidad: "W",
    }),
    "12",
  );
});

test("una opción usada se desactiva en vez de borrarse", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from attribute_options[\s\S]*for update/i, filas: [{ id: "10" }] },
    { patron: /count[\s\S]*product_attribute_values/i, filas: [{ usos: 3 }] },
  ]);

  assert.equal(await retirarOpcion(ejecutar, "10"), "desactivado");
  assert.equal(indiceDe(sentencias, /delete from attribute_options/i), -1);
  assert.ok(indiceDe(sentencias, /update attribute_options set active = false/i) >= 0);
});

test("crear una opción la vincula a su atributo", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /insert into attribute_options/i, filas: [{ id: "20" }] },
  ]);
  assert.equal(
    await crearOpcion(ejecutar, "1", { clave: "calida", etiqueta: "Cálida", posicion: 10 }),
    "20",
  );
  assert.deepEqual(sentencias[0].parametros, ["1", "calida", "Cálida", 10]);
});

test("retirar una definición inexistente devuelve un error tipado", async () => {
  const { ejecutar } = ejecutorFalso();
  await assert.rejects(
    retirarAtributo(ejecutar, "999"),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "no-encontrado",
  );
  await assert.rejects(
    retirarOpcion(ejecutar, "999"),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "no-encontrado",
  );
});
