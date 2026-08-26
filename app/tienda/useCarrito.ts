"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { contarArticulos } from "./carrito";
import {
  despachar,
  hidratar,
  obtenerLineas,
  obtenerLineasDelServidor,
  suscribirse,
} from "./carritoStore";

export default function useCarrito() {
  const lineas = useSyncExternalStore(
    suscribirse,
    obtenerLineas,
    obtenerLineasDelServidor,
  );

  useEffect(() => {
    hidratar();
  }, []);

  const agregar = useCallback(
    (econoluzReference: string, cantidad?: number) =>
      despachar({ tipo: "agregar", econoluzReference, cantidad }),
    [],
  );

  const quitar = useCallback(
    (econoluzReference: string) => despachar({ tipo: "quitar", econoluzReference }),
    [],
  );

  const fijar = useCallback(
    (econoluzReference: string, cantidad: number) =>
      despachar({ tipo: "fijar", econoluzReference, cantidad }),
    [],
  );

  const aceptarEspera = useCallback(
    (econoluzReference: string) =>
      despachar({ tipo: "aceptarEspera", econoluzReference }),
    [],
  );

  const vaciar = useCallback(() => despachar({ tipo: "vaciar" }), []);

  const cantidades = useMemo(
    () => new Map(lineas.map((linea) => [linea.econoluzReference, linea.cantidad])),
    [lineas],
  );

  const cantidadDe = useCallback(
    (econoluzReference: string) => cantidades.get(econoluzReference) ?? 0,
    [cantidades],
  );

  return {
    lineas,
    articulos: contarArticulos(lineas),
    agregar,
    quitar,
    fijar,
    aceptarEspera,
    vaciar,
    cantidadDe,
  };
}
