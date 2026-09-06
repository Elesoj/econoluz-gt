// app/admin/(panel)/envios/page.tsx
//
// Portada operativa de envíos. Muestra lo único que hay que configurar hoy: la
// tarifa y el umbral del mensajero propio, y qué método atiende cada una de las
// 22 zonas capitalinas.
//
// No hay formulario para crear zonas de reparto ni para asignar tarifas a Guatex:
// su coste depende del peso del pedido y ECONOLUZ no lo conoce desde la web.

import Link from "next/link";
import { verificarSesion } from "../../auth/authorization.server";
import { obtenerRecogidaEnTienda } from "../../../lib/ajustes.server";
import {
  obtenerMetodosZonas,
  obtenerReglasPropias,
} from "../../../envios/configuracion.server";
import { ZONAS_CAPITALINAS_VALIDAS } from "../../../envios/zonasCapitalinas";
import { formatPrice } from "../../../lib/formatters";
import { aQuetzales } from "../../../lib/dinero";
import {
  cambiarMetodoZonaAction,
  guardarRecogidaAction,
  guardarReglasEnvioAction,
} from "../../envios/actions";

export const dynamic = "force-dynamic";

export default async function EnviosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verificarSesion();

  const consulta = searchParams ? await searchParams : {};
  const error = typeof consulta.error === "string" ? consulta.error : "";
  const guardado = consulta.guardado === "1";

  const [metodosZonas, reglas, recogida] = await Promise.all([
    obtenerMetodosZonas(),
    obtenerReglasPropias(),
    obtenerRecogidaEnTienda(),
  ]);

  const zonasGuatex = ZONAS_CAPITALINAS_VALIDAS.filter((z) => metodosZonas[z] === "guatex");

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <Link
            href="/admin"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white"
          >
            ← Panel
          </Link>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Envíos</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">
            El mensajero propio solo entra en el municipio de Guatemala. Todo destino
            fuera de la capital se entrega con Guatex, cuyo coste depende del peso del
            pedido y se acuerda por WhatsApp con el cliente.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {error ? (
          <p
            role="alert"
            className="mb-6 border-l-2 border-tienda bg-neutral-50 px-4 py-3 text-sm text-tienda"
          >
            {error}
          </p>
        ) : null}

        {guardado ? (
          <p role="status" className="mb-6 border-l-2 border-proyectos bg-neutral-50 px-4 py-3 text-sm text-proyectos">
            Cambio guardado.
          </p>
        ) : null}

        <section className="border border-neutral-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-proyectos">Reglas del mensajero propio</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Hoy: {formatPrice(aQuetzales(reglas.tarifaCents))} de envío, gratis a partir de{" "}
            {formatPrice(aQuetzales(reglas.umbralGratisCents))} de productos. El umbral es
            inclusivo: un pedido de exactamente esa cantidad ya no paga envío.
          </p>

          <form action={guardarReglasEnvioAction} className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Tarifa fija (Q)
                <span className="mt-1 flex items-center border border-neutral-300">
                  <span
                    aria-hidden="true"
                    className="border-r border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
                  >Q</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="tarifaQuetzales"
                    defaultValue={aQuetzales(reglas.tarifaCents).toFixed(2)}
                    required
                    className="w-full px-3 py-2 text-sm"
                  />
                </span>
              </label>
              <span className="mt-1 block text-xs text-neutral-500">
                Lo que paga quien compra por debajo del umbral.
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Envío gratis a partir de (Q)
                <span className="mt-1 flex items-center border border-neutral-300">
                  <span
                    aria-hidden="true"
                    className="border-r border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
                  >Q</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="umbralGratisQuetzales"
                    defaultValue={aQuetzales(reglas.umbralGratisCents).toFixed(2)}
                    required
                    className="w-full px-3 py-2 text-sm"
                  />
                </span>
              </label>
              <span className="mt-1 block text-xs text-neutral-500">
                Se cuenta sobre el importe de los productos, sin el envío.
              </span>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="bg-tienda px-4 py-2 text-sm font-medium text-white hover:bg-tienda-fuerte"
              >
                Guardar reglas
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 border border-neutral-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-proyectos">
            Zonas del municipio de Guatemala
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Las 22 zonas que existen en la ciudad. Cambiar una a Guatex afecta solo a los
            pedidos nuevos.{" "}
            {zonasGuatex.length > 0 ? (
              <>
                Hoy van por Guatex las zonas {zonasGuatex.join(", ")}.
              </>
            ) : (
              <>Hoy ninguna zona va por Guatex.</>
            )}
          </p>

          <div className="mt-4 divide-y divide-neutral-200">
            {ZONAS_CAPITALINAS_VALIDAS.map((zona) => {
              const metodoActual = metodosZonas[zona];
              return (
                <form
                  key={zona}
                  action={cambiarMetodoZonaAction}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <input type="hidden" name="zona" value={zona} />
                  <span className="font-medium text-neutral-800">Zona {zona}</span>

                  <div className="flex items-center gap-3">
                    <label className="sr-only" htmlFor={`metodo-zona-${zona}`}>
                      Método de la zona {zona}
                    </label>
                    <select
                      id={`metodo-zona-${zona}`}
                      name="metodo"
                      defaultValue={metodoActual}
                      className="border border-neutral-300 px-3 py-1.5 text-sm"
                    >
                      <option value="mensajero_propio">Mensajero propio</option>
                      <option value="guatex">Guatex</option>
                    </select>

                    <button
                      type="submit"
                      className="border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      Guardar método
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>

        <section className="mt-8 border border-neutral-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-proyectos">Recogida en tienda</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Estado actual:{" "}
            <strong className={recogida.activa ? "text-proyectos" : "text-neutral-700"}>
              {recogida.activa
                ? "se ofrece al cliente, y es gratis"
                : "no se ofrece al cliente"}
            </strong>
            . Quien la elige recoge el pedido en la tienda: no paga envío y no hace falta
            una dirección de entrega.
          </p>

          <form action={guardarRecogidaAction} className="mt-5 space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <input
                type="checkbox"
                name="activa"
                defaultChecked={recogida.activa}
                className="size-4"
              />
              Ofrecer recogida en tienda
            </label>

            <label className="block text-sm font-medium text-neutral-800">
              Información para el cliente
              <textarea
                name="texto"
                defaultValue={recogida.texto}
                maxLength={200}
                rows={3}
                placeholder="21 Avenida 0-18, Vista Hermosa 2, zona 15. De lunes a viernes, de 8:00 a 17:00."
                className="mt-1 block w-full border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <span className="block text-xs text-neutral-500">
              Dónde y cuándo recoger, en 200 caracteres como mucho. Es obligatorio si se
              ofrece la recogida.
            </span>

            <button
              type="submit"
              className="bg-tienda px-4 py-2 text-sm font-medium text-white hover:bg-tienda-fuerte"
            >
              Guardar recogida
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
