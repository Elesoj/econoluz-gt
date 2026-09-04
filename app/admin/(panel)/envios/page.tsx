// app/admin/(panel)/envios/page.tsx

import Link from "next/link";
import { verificarSesion } from "../../auth/authorization.server";
import { obtenerResumenCoberturaPais } from "../../envios/cobertura.server";
import { obtenerZonasAdmin } from "../../envios/zonas.server";
import { obtenerRecogidaEnTienda } from "../../../lib/ajustes.server";
import { configurarRecogida } from "../../envios/actions";
import { formatPrice } from "../../../lib/formatters";

export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  await verificarSesion();

  const [{ departamentos, estadisticas }, zonas, recogida] = await Promise.all([
    obtenerResumenCoberturaPais(),
    obtenerZonasAdmin(),
    obtenerRecogidaEnTienda(),
  ]);


  const departamentosSinCobertura = departamentos.filter((d) => d.estado === "sin_cobertura");

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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold sm:text-4xl">Envíos y tarifas</h1>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">
            Configuración de zonas de reparto, tarifas oficiales y cobertura geográfica nacional.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {/* Encabezado honesto (§6.2 del diseño) */}
        <div className="border-l-4 border-tienda bg-neutral-50 p-6 shadow-xs">
          <p className="text-lg text-neutral-900">
            <strong>{departamentosSinCobertura.length} departamentos no calculan envío</strong>: sus
            clientes no podrán pagar en línea cuando exista el checkout.
          </p>
          {estadisticas.parciales > 0 ? (
            <p className="mt-2 text-sm text-neutral-600">
              Además, {estadisticas.parciales} departamento(s) tienen cobertura parcial con
              municipios expresamente excluidos de la entrega directa.
            </p>
          ) : null}
        </div>

        {/* Resumen de estadísticas */}
        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          <div className="border border-neutral-200 bg-white p-5">
            <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Cobertura completa
            </dt>
            <dd className="mt-2 text-3xl font-bold text-emerald-700">
              {estadisticas.completos}
              <span className="text-sm font-normal text-neutral-400"> / {estadisticas.totalDepartamentos}</span>
            </dd>
            <p className="mt-1 text-xs text-neutral-500">Departamentos</p>
          </div>
          <div className="border border-neutral-200 bg-white p-5">
            <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Cobertura parcial
            </dt>
            <dd className="mt-2 text-3xl font-bold text-amber-600">
              {estadisticas.parciales}
              <span className="text-sm font-normal text-neutral-400"> / {estadisticas.totalDepartamentos}</span>
            </dd>
            <p className="mt-1 text-xs text-neutral-500">Con excepciones</p>
          </div>
          <div className="border border-neutral-200 bg-white p-5">
            <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Sin cobertura
            </dt>
            <dd className="mt-2 text-3xl font-bold text-neutral-700">
              {estadisticas.sinCobertura}
              <span className="text-sm font-normal text-neutral-400"> / {estadisticas.totalDepartamentos}</span>
            </dd>
            <p className="mt-1 text-xs text-neutral-500">Van a cotización</p>
          </div>
          <div className="border border-neutral-200 bg-white p-5">
            <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Municipios cubiertos
            </dt>
            <dd className="mt-2 text-3xl font-bold text-proyectos">
              {estadisticas.municipiosCubiertos}
              <span className="text-sm font-normal text-neutral-400"> / {estadisticas.totalMunicipios}</span>
            </dd>
            <p className="mt-1 text-xs text-neutral-500">Total nacional</p>
          </div>
        </dl>

        {/* Recogida en tienda (§4.9 del diseño y Tarea 14) */}
        <section className="mt-12 border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-proyectos">Recogida en tienda</h2>
                {recogida.activa ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                    Activa (Q0)
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 border border-neutral-300">
                    Desactivada
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                Método de entrega sin coste (Q0) que no depende de geografía. Se almacena en la configuración de la tienda.
              </p>
            </div>
          </div>

          <form action={configurarRecogida} className="mt-6 space-y-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="recogida-activa"
                name="activa"
                defaultChecked={recogida.activa}
                className="mt-1 h-4 w-4 rounded border-neutral-300 text-tienda focus:ring-tienda"
              />
              <label htmlFor="recogida-activa" className="text-sm font-medium text-neutral-900 cursor-pointer">
                Habilitar recogida en tienda para los clientes
                <span className="block text-xs font-normal text-neutral-500">
                  Si se desactiva, los clientes solo podrán elegir envíos a domicilio en las zonas con cobertura y tarifa.
                </span>
              </label>
            </div>

            <div>
              <label htmlFor="recogida-texto" className="block text-sm font-medium text-neutral-900">
                Dirección y horario del punto de entrega
              </label>
              <p className="text-xs text-neutral-500 mb-1">
                Información visible para el cliente durante el pedido (máximo 200 caracteres).
              </p>
              <textarea
                id="recogida-texto"
                name="texto"
                rows={2}
                maxLength={200}
                defaultValue={recogida.texto}
                placeholder="Ej.: 21 Avenida 0-18, zona 15, Ciudad de Guatemala. Lunes a viernes de 8:00 a 17:00."
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-tienda focus:outline-none focus:ring-1 focus:ring-tienda"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-md bg-proyectos px-4 py-2 text-sm font-semibold text-white hover:bg-proyectos/90 focus:outline-none focus:ring-2 focus:ring-proyectos/50 cursor-pointer"
              >
                Guardar ajuste de recogida
              </button>
            </div>
          </form>
        </section>

        {/* Listado de Zonas de Reparto */}
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-proyectos">Zonas de reparto</h2>
              <p className="text-sm text-neutral-600">
                Cada zona agrupa coberturas y una tarifa publicada vigente.
              </p>
            </div>
          </div>

          {zonas.length === 0 ? (
            <div className="mt-6 border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
              <p className="font-medium">No hay zonas de reparto configuradas en la base de datos.</p>
              <p className="mt-1 text-xs text-neutral-400">
                Las zonas se crean desde el panel para no precargar tarifas comerciales inventadas.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto border border-neutral-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Zona</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Tarifa vigente</th>
                    <th className="px-4 py-3">Plazo</th>
                    <th className="px-4 py-3">Estado (§6.3)</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {zonas.map((zona) => (
                    <tr key={zona.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-proyectos">{zona.nombre}</div>
                        <div className="text-xs text-neutral-500 font-mono">{zona.codigo}</div>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {zona.metodo === "mensajero_propio" ? "Mensajero propio" : "Paquetería"}
                      </td>
                      <td className="px-4 py-3">
                        {zona.tarifaVigente ? (
                          <div>
                            <span className="font-semibold text-neutral-900">
                              {formatPrice(zona.tarifaVigente.importeCents / 100)}
                            </span>
                            {zona.tarifaVigente.umbralGratisCents !== null ? (
                              <span className="block text-xs text-neutral-500">
                                Gratis desde {formatPrice(zona.tarifaVigente.umbralGratisCents / 100)}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="italic text-neutral-400">Sin tarifa publicada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {zona.tarifaVigente ? (
                          <span>
                            {zona.tarifaVigente.plazoMinDias} - {zona.tarifaVigente.plazoMaxDias} días
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {zona.calculaEnvio ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                            Calcula envío
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700 border border-neutral-300"
                            title={zona.motivoEstado}
                          >
                            Cotización ({zona.motivoEstado})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/envios/${zona.codigo}`}
                          className="font-medium text-proyectos hover:underline"
                        >
                          Ver ficha →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Resumen de Cobertura por Departamento */}
        <section className="mt-12">
          <div className="border-b border-neutral-200 pb-4">
            <h2 className="text-lg font-semibold text-proyectos">
              Cobertura geográfica por departamento
            </h2>
            <p className="text-sm text-neutral-600">
              Evaluación calculada municipio a municipio para evitar discrepancias con el checkout.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto border border-neutral-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-4 py-3 w-16">Código</th>
                  <th className="px-4 py-3">Departamento</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Municipios cubiertos</th>
                  <th className="px-4 py-3">Municipios excluidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {departamentos.map((depto) => (
                  <tr key={depto.codigo} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{depto.codigo}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{depto.nombre}</td>
                    <td className="px-4 py-3">
                      {depto.estado === "completa" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          Completa
                        </span>
                      ) : depto.estado === "parcial" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300">
                          Parcial
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 border border-neutral-300">
                          Sin cobertura
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {depto.municipiosCubiertos} de {depto.totalMunicipios}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {depto.municipiosExcluidos.length > 0 ? (
                        <span className="font-medium text-red-700">
                          {depto.municipiosExcluidos.join(", ")}
                        </span>
                      ) : depto.estado === "completa" ? (
                        <span className="text-neutral-400">Ninguno (cobertura total)</span>
                      ) : (
                        <span className="text-neutral-400">Todos los municipios van a cotización</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
