"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicProduct } from "../data/publicProduct";
import { formatPrice } from "../lib/formatters";
import { CANTIDAD_MAXIMA_POR_LINEA } from "../tienda/carrito";
import { consultarDisponibilidad } from "../tienda/disponibilidad.server";
import type { Disponibilidad } from "../tienda/disponibilidad";
import { aQuetzales, resolverCarrito } from "../tienda/lineas";
import useCarrito from "../tienda/useCarrito";

type CarritoClienteProps = {
  productos: PublicProduct[];
};

export default function CarritoCliente({ productos }: CarritoClienteProps) {
  const { lineas, fijar, quitar, aceptarEspera, cantidadDe } = useCarrito();
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>({});

  // El inventario no viaja en el catálogo público —ahí cualquiera podría leer
  // las existencias de los 313 productos—, así que se le pregunta al servidor
  // solo por lo que esta persona lleva en el carrito. Mientras no conteste, el
  // carrito funciona igual y no promete plazos.
  useEffect(() => {
    if (lineas.length === 0) {
      // No se limpia lo que ya se sabía: `resolverCarrito` solo mira las
      // referencias que siguen en el carrito, así que lo viejo es inofensivo.
      return;
    }

    let vigente = true;

    consultarDisponibilidad(lineas)
      .then((respuesta) => {
        if (vigente) {
          setDisponibilidad(respuesta);
        }
      })
      .catch(() => {
        // Ya queda constancia en el servidor; aquí no hay nada que decirle al
        // cliente, que puede seguir comprando.
      });

    return () => {
      vigente = false;
    };
  }, [lineas]);

  const resuelto = useMemo(
    () => resolverCarrito(lineas, productos, disponibilidad),
    [lineas, productos, disponibilidad],
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-24 pt-28 sm:px-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">Tu carrito</h1>

      {resuelto.descartadas.length > 0 && (
        <p className="mt-4 border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          {resuelto.descartadas.length === 1
            ? "Un producto que tenías guardado ya no está disponible y se ha quitado del carrito."
            : `${resuelto.descartadas.length} productos que tenías guardados ya no están disponibles y se han quitado del carrito.`}
        </p>
      )}

      {resuelto.lineas.length === 0 ? (
        <div className="mt-10 border border-neutral-200 p-8 text-center">
          <p className="text-sm text-neutral-600">Todavía no has agregado nada.</p>
          <Link
            href="/catalogo"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-tienda px-6 text-sm font-semibold text-white transition hover:bg-tienda-fuerte"
          >
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
            {resuelto.lineas.map((linea) => (
              <li
                key={linea.producto.econoluzReference}
                className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center"
              >
                <div className="relative aspect-square w-20 shrink-0 overflow-hidden bg-white">
                  <Image
                    src={linea.producto.image}
                    alt={linea.producto.publicName}
                    fill
                    sizes="80px"
                    className="object-contain"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    {linea.producto.publicName}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Ref. {linea.producto.econoluzReference}
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-neutral-600">
                    {formatPrice(aQuetzales(linea.precioCentavos))} por unidad
                  </p>
                  {/* Pedir más de lo que hay no bloquea la venta, pero tampoco
                      se resuelve en silencio: se le dice cuántas hay y se le
                      deja elegir entre llevarse esas o esperar por el resto. */}
                  {linea.superaExistencias &&
                    typeof linea.disponiblesAhora === "number" &&
                    (linea.esperaAceptada ? (
                      <p className="mt-2 text-xs font-semibold text-tienda">
                        Esperarás por{" "}
                        {linea.cantidad - linea.disponiblesAhora === 1
                          ? "una unidad"
                          : `${linea.cantidad - linea.disponiblesAhora} unidades`}
                        : te contactaremos para confirmarte el plazo.
                      </p>
                    ) : (
                      <div className="mt-2 border border-tienda/30 bg-tienda/5 p-3">
                        <p className="text-xs font-semibold text-tienda">
                          Tenemos {linea.disponiblesAhora}{" "}
                          {linea.disponiblesAhora === 1
                            ? "disponible"
                            : "disponibles"}{" "}
                          ahora mismo.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              fijar(
                                linea.producto.econoluzReference,
                                linea.disponiblesAhora ?? linea.cantidad,
                              )
                            }
                            className="inline-flex h-8 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold transition hover:border-tienda"
                          >
                            Dejar solo {linea.disponiblesAhora}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              aceptarEspera(linea.producto.econoluzReference)
                            }
                            className="inline-flex h-8 items-center rounded-full bg-tienda px-3 text-xs font-semibold text-white transition hover:bg-tienda-fuerte"
                          >
                            Quiero {linea.cantidad} y espero
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                  <label
                    className="sr-only"
                    htmlFor={`cantidad-${linea.producto.id}`}
                  >
                    Cantidad de {linea.producto.publicName}
                  </label>
                  <input
                    id={`cantidad-${linea.producto.id}`}
                    type="number"
                    min={1}
                    max={CANTIDAD_MAXIMA_POR_LINEA}
                    value={cantidadDe(linea.producto.econoluzReference)}
                    onChange={(evento) =>
                      fijar(
                        linea.producto.econoluzReference,
                        Number(evento.target.value),
                      )
                    }
                    className="h-10 w-20 rounded-full border border-neutral-300 px-3 text-center text-sm tabular-nums"
                  />
                  <p className="w-28 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(aQuetzales(linea.subtotalCentavos))}
                  </p>
                  <button
                    type="button"
                    onClick={() => quitar(linea.producto.econoluzReference)}
                    className="text-xs font-semibold text-neutral-500 underline transition hover:text-black"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col items-end gap-4">
            <p className="text-lg font-semibold tabular-nums">
              Total: {formatPrice(aQuetzales(resuelto.totalCentavos))}
            </p>

            {/* El pago en línea llega con la pasarela. Hasta entonces el botón
                se ve pero no promete nada que la web no pueda cumplir. */}
            <button
              type="button"
              disabled
              className="inline-flex h-12 items-center justify-center rounded-full bg-tienda px-8 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ir a pagar
            </button>
            <p className="text-xs text-neutral-500">
              El pago en línea está en preparación. Mientras tanto, escríbenos y
              cerramos el pedido por WhatsApp.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
