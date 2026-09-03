import assert from "node:assert/strict";
import { test } from "node:test";

import { CARRITO_STORAGE_KEY, guardarCarrito } from "../app/tienda/carritoPersistencia";
import {
  aplicarConReversion,
  comprobarSesionYSincronizar,
  limpiarCarritoPrivado,
  sincronizarAlEntrar,
  type Sincronizador,
} from "../app/tienda/carritoSincronizacion";

/** Un `localStorage` de mentira, con la misma superficie que usa el carrito. */
function almacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
    get contenido() {
      return datos.get(CARRITO_STORAGE_KEY) ?? null;
    },
  };
}

const sincronizadorQue = (
  resultado: Awaited<ReturnType<Sincronizador["fijar"]>>,
): Sincronizador & { llamadas: string[] } => {
  const llamadas: string[] = [];
  return {
    llamadas,
    fijar: async (referencia, cantidad) => {
      llamadas.push(`fijar ${referencia} ${cantidad}`);
      return resultado;
    },
    quitar: async (referencia) => {
      llamadas.push(`quitar ${referencia}`);
      return resultado;
    },
    vaciar: async () => {
      llamadas.push("vaciar");
      return resultado;
    },
  };
};

// --- Actualización optimista con reversión ---------------------------------------------

test("la linea cambia antes de que conteste el servidor", async () => {
  const sincronizador = sincronizadorQue({ ok: true, lineas: [] });
  const previas = [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }];

  const vistas: number[] = [];
  await aplicarConReversion(
    previas,
    { tipo: "fijar", econoluzReference: "ECO-ELE-0001", cantidad: 4 },
    sincronizador,
    (lineas) => vistas.push(lineas[0]?.cantidad ?? 0),
  );

  assert.equal(vistas[0], 4, "la primera pintada ya tiene la cantidad nueva");
});

test("el servidor manda: su respuesta sustituye a la version optimista", async () => {
  const sincronizador = sincronizadorQue({
    ok: true,
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 3 }],
  });

  const resultado = await aplicarConReversion(
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }],
    { tipo: "fijar", econoluzReference: "ECO-ELE-0001", cantidad: 4 },
    sincronizador,
    () => {},
  );

  assert.deepEqual(resultado.lineas, [{ econoluzReference: "ECO-ELE-0001", cantidad: 3 }]);
  assert.equal(resultado.revertido, false);
});

/**
 * La actualización optimista solo vale si revierte bien. Si el servidor dice que no, la
 * pantalla tiene que volver **exactamente** a lo que había, no a una aproximación.
 */
test("si el servidor falla, la pantalla vuelve exactamente a lo que habia", async () => {
  const sincronizador = sincronizadorQue({ ok: false });
  const previas = [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }];

  const vistas: { cantidad: number }[][] = [];
  const resultado = await aplicarConReversion(
    previas,
    { tipo: "fijar", econoluzReference: "ECO-ELE-0001", cantidad: 40 },
    sincronizador,
    (lineas) => vistas.push(lineas.map((l) => ({ cantidad: l.cantidad }))),
  );

  assert.equal(resultado.revertido, true);
  assert.deepEqual(resultado.lineas, previas);
  assert.deepEqual(vistas.at(-1), [{ cantidad: 1 }], "la ultima pintada es la de antes");
});

test("un fallo de red revierte igual que un error del servidor", async () => {
  const sincronizador: Sincronizador = {
    fijar: async () => {
      throw new TypeError("Failed to fetch");
    },
    quitar: async () => ({ ok: false }),
    vaciar: async () => ({ ok: false }),
  };

  const previas = [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }];
  const resultado = await aplicarConReversion(
    previas,
    { tipo: "agregar", econoluzReference: "ECO-ELE-0001", cantidad: 1 },
    sincronizador,
    () => {},
  );

  assert.equal(resultado.revertido, true);
  assert.deepEqual(resultado.lineas, previas);
});

test("cada accion llama a la operacion que le toca", async () => {
  for (const [accion, esperada] of [
    [{ tipo: "fijar", econoluzReference: "ECO-ELE-0001", cantidad: 2 }, "fijar ECO-ELE-0001 2"],
    [{ tipo: "agregar", econoluzReference: "ECO-ELE-0001", cantidad: 2 }, "fijar ECO-ELE-0001 2"],
    [{ tipo: "quitar", econoluzReference: "ECO-ELE-0001" }, "quitar ECO-ELE-0001"],
    [{ tipo: "vaciar" }, "vaciar"],
  ] as const) {
    const sincronizador = sincronizadorQue({ ok: true, lineas: [] });
    await aplicarConReversion([], accion, sincronizador, () => {});
    assert.deepEqual(sincronizador.llamadas, [esperada]);
  }
});

/**
 * `aceptarEspera` es del aviso de existencias, que no viaja al servidor —ECONOLUZ no
 * maneja inventario— y que el subproyecto 11 retirará. Se aplica en pantalla y no genera
 * ninguna petición.
 */
test("aceptar la espera no llama al servidor", async () => {
  const sincronizador = sincronizadorQue({ ok: true, lineas: [] });
  await aplicarConReversion(
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
    { tipo: "aceptarEspera", econoluzReference: "ECO-ELE-0001" },
    sincronizador,
    () => {},
  );

  assert.deepEqual(sincronizador.llamadas, []);
});

// --- La fusión al entrar ----------------------------------------------------------------

test("al entrar se manda el carrito local y se recibe el del servidor", async () => {
  const almacen = almacenFalso();
  guardarCarrito(almacen, [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]);

  const enviados: unknown[] = [];
  const resultado = await sincronizarAlEntrar({
    almacen,
    token: "tok-de-prueba-1234",
    fusionar: async (lineas) => {
      enviados.push(lineas);
      return { ok: true, lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 5 }], descartes: [] };
    },
  });

  assert.deepEqual(enviados, [[{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]]);
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.lineas, [{ econoluzReference: "ECO-ELE-0001", cantidad: 5 }]);
  }
});

test("el carrito anonimo se borra solo despues del exito", async () => {
  const almacen = almacenFalso();
  guardarCarrito(almacen, [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]);

  await sincronizarAlEntrar({
    almacen,
    token: "tok-de-prueba-1234",
    fusionar: async () => ({ ok: true, lineas: [], descartes: [] }),
  });

  assert.equal(almacen.contenido, null, "tras el exito no queda carrito anonimo");
});

/**
 * Si la fusión falla, el carrito local se conserva **completo**. Perderlo sería perder la
 * compra del cliente por un problema de red que no es suyo.
 */
test("si la fusion falla, el carrito local se conserva entero", async () => {
  const almacen = almacenFalso();
  guardarCarrito(almacen, [
    { econoluzReference: "ECO-ELE-0001", cantidad: 2 },
    { econoluzReference: "ECO-ELE-0002", cantidad: 7 },
  ]);
  const antes = almacen.contenido;

  const resultado = await sincronizarAlEntrar({
    almacen,
    token: "tok-de-prueba-1234",
    fusionar: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  assert.equal(resultado.ok, false);
  assert.equal(almacen.contenido, antes, "el carrito local no se toca si la fusion falla");
});

test("la fusion devuelve los descartes para poder decirlos", async () => {
  const almacen = almacenFalso();
  const resultado = await sincronizarAlEntrar({
    almacen,
    token: "tok-de-prueba-1234",
    fusionar: async () => ({
      ok: true,
      lineas: [],
      descartes: [{ econoluzReference: "ECO-ELE-0009", motivo: "sin-precio" }],
    }),
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.descartes.length, 1);
});

test("entrar sin nada en el carrito local tambien sincroniza", async () => {
  const almacen = almacenFalso();
  let llamado = false;

  await sincronizarAlEntrar({
    almacen,
    token: "tok-de-prueba-1234",
    fusionar: async () => {
      llamado = true;
      return { ok: true, lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }], descartes: [] };
    },
  });

  assert.equal(llamado, true, "hay que traerse el carrito guardado del cliente");
});

// --- El cierre de sesión ------------------------------------------------------------------

/**
 * Un dispositivo compartido no puede quedarse con la compra de quien acaba de salir. Al
 * cerrar sesión, el carrito privado desaparece del navegador.
 */
test("cerrar sesion borra el carrito privado del navegador", () => {
  const almacen = almacenFalso();
  guardarCarrito(almacen, [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]);

  limpiarCarritoPrivado(almacen);

  assert.equal(almacen.contenido, null);
  assert.equal(almacen.getItem(CARRITO_STORAGE_KEY), null);
});

test("limpiar un almacen que ya estaba vacio no rompe nada", () => {
  const almacen = almacenFalso();
  assert.doesNotThrow(() => limpiarCarritoPrivado(almacen));
});

test("un almacen que lanza al tocarlo no tumba la limpieza", () => {
  const bloqueado = (clave: string): never => {
    throw new Error(`almacen bloqueado al tocar ${clave}`);
  };
  const almacenRoto = {
    getItem: bloqueado,
    setItem: (clave: string) => bloqueado(clave),
    removeItem: bloqueado,
  };

  assert.doesNotThrow(() => limpiarCarritoPrivado(almacenRoto));
});

// --- La sesión que se acaba sola ---------------------------------------------------------

/**
 * Hoy no hay botón de cerrar sesión, pero la sesión se acaba igual: caduca, se revoca
 * desde otro dispositivo o se borra la cookie. El carrito tiene que darse cuenta y volver
 * a ser anónimo, en vez de seguir intentando escribir en un carrito que ya no es de nadie.
 */
test("un «sin sesion» del servidor se distingue de un fallo cualquiera", async () => {
  const sincronizador: Sincronizador = {
    fijar: async () => ({ ok: false, sinSesion: true }),
    quitar: async () => ({ ok: false }),
    vaciar: async () => ({ ok: false }),
  };

  const previas = [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }];
  const resultado = await aplicarConReversion(
    previas,
    { tipo: "fijar", econoluzReference: "ECO-ELE-0001", cantidad: 5 },
    sincronizador,
    () => {},
  );

  assert.equal(resultado.revertido, true);
  assert.equal(resultado.sinSesion, true);
  assert.deepEqual(resultado.lineas, previas, "la reversion sigue siendo exacta");
});

test("un fallo normal no se confunde con el final de la sesion", async () => {
  const resultado = await aplicarConReversion(
    [],
    { tipo: "vaciar" },
    sincronizadorQue({ ok: false }),
    () => {},
  );

  assert.notEqual(resultado.sinSesion, true);
});

// --- Cuándo se comprueba la sesión --------------------------------------------------------

/**
 * La comprobación es **una por pestaña** para no molestar al visitante anónimo con una
 * petición por navegación. Pero iniciar sesión no remonta el layout —Next conserva el árbol
 * en una navegación de cliente—, así que sin un disparo explícito la fusión no ocurriría
 * hasta la siguiente recarga. Eso deja al cliente recién entrado viendo su carrito local
 * como si no hubiera pasado nada.
 */
test("sin haber comprobado antes, se comprueba", async () => {
  let comprobado = false;
  const resultado = await comprobarSesionYSincronizar({
    forzar: false,
    yaComprobado: () => false,
    anotarComprobado: () => {
      comprobado = true;
    },
    haySesion: async () => false,
    entrar: async () => ({ ok: false }),
  });

  assert.equal(resultado, "anonimo");
  assert.equal(comprobado, true);
});

test("ya comprobada la pestana, no se vuelve a preguntar", async () => {
  let preguntas = 0;
  const resultado = await comprobarSesionYSincronizar({
    forzar: false,
    yaComprobado: () => true,
    anotarComprobado: () => {},
    haySesion: async () => {
      preguntas += 1;
      return true;
    },
    entrar: async () => ({ ok: true, lineas: [], descartes: [] }),
  });

  assert.equal(resultado, "omitido");
  assert.equal(preguntas, 0);
});

test("iniciar sesion fuerza la comprobacion aunque la pestana ya la hubiera hecho", async () => {
  const resultado = await comprobarSesionYSincronizar({
    forzar: true,
    yaComprobado: () => true,
    anotarComprobado: () => {},
    haySesion: async () => true,
    entrar: async () => ({
      ok: true,
      lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
      descartes: [],
    }),
  });

  assert.equal(resultado, "fusionado");
});

/**
 * Si la fusión falla, la pestaña no puede quedarse marcada como comprobada: el carrito
 * local sigue entero y hay que volver a intentarlo.
 */
test("si la fusion falla, la pestana no queda marcada como comprobada", async () => {
  let comprobado = false;
  const resultado = await comprobarSesionYSincronizar({
    forzar: false,
    yaComprobado: () => false,
    anotarComprobado: () => {
      comprobado = true;
    },
    haySesion: async () => true,
    entrar: async () => ({ ok: false }),
  });

  assert.equal(resultado, "fallo");
  assert.equal(comprobado, false, "un fallo no puede impedir el reintento");
});

test("un fallo al preguntar por la sesion no se toma por «no hay sesion»", async () => {
  let comprobado = false;
  const resultado = await comprobarSesionYSincronizar({
    forzar: false,
    yaComprobado: () => false,
    anotarComprobado: () => {
      comprobado = true;
    },
    haySesion: async () => {
      throw new TypeError("Failed to fetch");
    },
    entrar: async () => ({ ok: true, lineas: [], descartes: [] }),
  });

  assert.equal(resultado, "fallo");
  assert.equal(comprobado, false);
});
