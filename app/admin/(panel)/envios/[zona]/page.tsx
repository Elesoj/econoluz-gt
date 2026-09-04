// app/admin/(panel)/envios/[zona]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "../../../../lib/formatters";
import { verificarSesion } from "../../../auth/authorization.server";
import { leer } from "../../../../lib/datos";
import {
  activarCobertura,
  activarZona,
  asignarCobertura,
  borrarBorradorDeTarifa,
  crearBorradorDeTarifa,
  editarZona,
  eliminarCobertura,
  eliminarZona,
  publicarTarifa,
} from "../../../envios/actions";

export const dynamic = "force-dynamic";

const claseCampo =
  "min-h-11 w-full rounded-xl border border-proyectos/25 px-4 text-base text-proyectos";
const claseArea =
  "w-full rounded-xl border border-proyectos/25 px-4 py-3 text-base leading-6 text-proyectos";
const claseEtiqueta = "text-sm font-semibold text-proyectos";

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t-2 border-proyectos/15 pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-tienda">{titulo}</h2>
      {descripcion ? <p className="mt-2 text-sm text-neutral-600">{descripcion}</p> : null}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default async function FichaZonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ zona: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verificarSesion();

  const { zona: slugParam } = await params;
  const consulta = await searchParams;
  const codigoSlug = decodeURIComponent(slugParam).trim().toLowerCase();

  // 1. Consultar la zona por código (slug)
  const zonas = await leer<{
    id: number | string;
    codigo: string;
    nombre: string;
    metodo: string;
    activa: boolean;
    notas: string;
  }>(
    `select id, codigo, nombre, metodo, activa, notas
       from shipping_zones
      where codigo = $1`,
    [codigoSlug],
  );

  const zona = zonas[0];
  if (!zona) {
    notFound();
  }

  const zoneId = Number(zona.id);

  // 2. Consultar coberturas asignadas con nombres de departamentos y municipios
  // 3. Consultar tarifas (publicadas y borradores)
  // 4. Catálogo de departamentos y municipios disponibles
  const [coberturas, tarifas, todosDeptos, todosMunis] = await Promise.all([
    leer<{
      id: number | string;
      departamento_codigo: string | null;
      municipio_codigo: string | null;
      activa: boolean;
      departamento_nombre: string | null;
      municipio_nombre: string | null;
    }>(
      `select a.id, a.departamento_codigo, a.municipio_codigo, a.activa,
              d.nombre as departamento_nombre,
              m.nombre as municipio_nombre
         from shipping_zone_areas a
         left join geo_departamentos d on d.codigo = a.departamento_codigo
         left join geo_municipios m on m.codigo = a.municipio_codigo
        where a.zone_id = $1
        order by a.departamento_codigo nulls last, a.municipio_codigo nulls last`,
      [zoneId],
    ),
    leer<{
      id: number | string;
      importe_cents: number;
      umbral_gratis_cents: number | null;
      max_piezas: number | null;
      max_importe_cents: number | null;
      plazo_min_dias: number;
      plazo_max_dias: number;
      publicada: boolean;
      vigente_desde: string | Date;
      vigente_hasta: string | Date | null;
      es_vigente_actual: boolean;
    }>(
      `select id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents,
              plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta,
              (publicada = true and vigente_desde <= now() and (vigente_hasta is null or vigente_hasta > now())) as es_vigente_actual
         from shipping_rates
        where zone_id = $1
        order by vigente_desde desc, id desc`,
      [zoneId],
    ),
    leer<{ codigo: string; nombre: string }>(
      `select d.codigo, d.nombre
         from geo_departamentos d
        where not exists (
          select 1 from shipping_zone_areas a where a.departamento_codigo = d.codigo
        )
        order by d.codigo asc`,
    ),
    leer<{ codigo: string; departamento_codigo: string; nombre: string }>(
      `select m.codigo, m.departamento_codigo, m.nombre
         from geo_municipios m
        where not exists (
          select 1 from shipping_zone_areas a where a.municipio_codigo = m.codigo
        )
        order by m.codigo asc`,
    ),
  ]);

  // Clasificar tarifas: vigente, borradores, cerradas
  let tarifaVigente: (typeof tarifas)[0] | null = null;
  const borradores: typeof tarifas = [];
  const cerradas: typeof tarifas = [];

  for (const t of tarifas) {
    if (!t.publicada) {
      borradores.push(t);
      continue;
    }

    if (t.es_vigente_actual) {
      if (!tarifaVigente) {
        tarifaVigente = t;
      } else {
        cerradas.push(t);
      }
    } else {
      cerradas.push(t);
    }
  }

  // Deducción de estado (§6.3)
  const coberturasActivas = coberturas.filter((c) => c.activa);
  const tieneCobertura = coberturasActivas.length > 0;
  let calculaEnvio = false;
  let motivoEstado = "Calcula envío";

  if (!zona.activa) {
    calculaEnvio = false;
    motivoEstado = "Zona desactivada";
  } else if (!tieneCobertura) {
    calculaEnvio = false;
    motivoEstado = "Sin cobertura activa asignada";
  } else if (!tarifaVigente) {
    calculaEnvio = false;
    motivoEstado = "Sin tarifa publicada vigente";
  } else {
    calculaEnvio = true;
    motivoEstado = "Calcula envío";
  }

  const error = typeof consulta.error === "string" ? consulta.error : "";
  const guardado = consulta.guardado === "1";

  // Acciones bound para formularios de toggle y eliminación
  const toggleZonaAction = activarZona.bind(null, zoneId, !zona.activa, zona.codigo);
  const eliminarZonaAction = eliminarZona.bind(null, zoneId, zona.codigo);
  const editarZonaAction = editarZona.bind(null, zoneId);
  const asignarCoberturaAction = asignarCobertura.bind(null, zoneId);
  const publicarTarifaAction = publicarTarifa.bind(null, zoneId);
  const crearBorradorAction = crearBorradorDeTarifa.bind(null, zoneId);

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
          <Link
            href="/admin/envios"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white"
          >
            ← Envíos y tarifas
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-white/70">Código: {zona.codigo} (inmutable)</p>
              <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{zona.nombre}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {calculaEnvio ? (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/40">
                  Calcula envío
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-500/40">
                  Cotización ({motivoEstado})
                </span>
              )}
              <form action={toggleZonaAction}>
                <button
                  type="submit"
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    zona.activa
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  }`}
                >
                  {zona.activa ? "Desactivar zona" : "Activar zona"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        {guardado ? (
          <p className="mb-6 border-l-2 border-proyectos bg-neutral-50 px-4 py-3 text-sm text-proyectos">
            Cambios guardados correctamente.
          </p>
        ) : null}

        {error ? (
          <p className="mb-6 border-l-2 border-tienda bg-neutral-50 px-4 py-3 text-sm text-tienda">
            {error}
          </p>
        ) : null}

        {/* 1. Datos Generales de la Zona */}
        <form action={editarZonaAction} className="flex flex-col gap-8">
          <input type="hidden" name="slug" value={zona.codigo} />

          <Seccion
            titulo="Datos de la zona"
            descripcion="El código es el identificador inmutable en la base de datos. Puedes modificar el nombre comercial, el método de entrega y las notas internas."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="codigo" className={claseEtiqueta}>
                  Código de zona (inmutable)
                </label>
                <input
                  id="codigo"
                  value={zona.codigo}
                  disabled
                  className={`${claseCampo} bg-neutral-100 font-mono text-sm text-neutral-500`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="nombre" className={claseEtiqueta}>
                  Nombre de la zona
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  defaultValue={zona.nombre}
                  required
                  className={claseCampo}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="metodo" className={claseEtiqueta}>
                  Método de entrega
                </label>
                <select
                  id="metodo"
                  name="metodo"
                  defaultValue={zona.metodo}
                  className={claseCampo}
                >
                  <option value="mensajero_propio">Mensajero propio (Capital y alrededores)</option>
                  <option value="paqueteria">Paquetería (Departamentos / Nacional)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <span className={claseEtiqueta}>Estado operativo</span>
                <p className="min-h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700">
                  {zona.activa ? "Zona activa" : "Zona desactivada"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="notas" className={claseEtiqueta}>
                Notas internas (máximo 500 caracteres, no visibles para clientes)
              </label>
              <textarea
                id="notas"
                name="notas"
                rows={3}
                defaultValue={zona.notas}
                className={claseArea}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-11 rounded-full bg-proyectos px-6 text-sm font-semibold text-white hover:bg-proyectos/90"
              >
                Guardar datos de zona
              </button>
            </div>
          </Seccion>
        </form>

        {/* 2. Coberturas Geográficas */}
        <div className="mt-12">
          <Seccion
            titulo="Cobertura geográfica asignada"
            descripcion="Departamentos enteros o municipios específicos cubiertos por esta zona. La especificidad por municipio manda sobre el departamento."
          >
            {coberturas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
                Esta zona aún no tiene coberturas asignadas. Añade un departamento o municipio más abajo.
              </p>
            ) : (
              <div className="overflow-x-auto border border-neutral-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    <tr>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                    {coberturas.map((c) => {
                      const areaId = Number(c.id);
                      const toggleAreaAction = activarCobertura.bind(
                        null,
                        areaId,
                        !c.activa,
                        zona.codigo,
                      );
                      const eliminarAreaAction = eliminarCobertura.bind(null, areaId, zona.codigo);

                      return (
                        <tr key={areaId} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 font-medium text-neutral-700">
                            {c.departamento_codigo ? "Departamento" : "Municipio"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                            {c.departamento_codigo ?? c.municipio_codigo}
                          </td>
                          <td className="px-4 py-3 font-medium text-neutral-900">
                            {c.departamento_nombre ?? c.municipio_nombre}
                          </td>
                          <td className="px-4 py-3">
                            {c.activa ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 border border-neutral-300">
                                Inactivo (excluido)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <form action={toggleAreaAction}>
                                <button
                                  type="submit"
                                  className="text-xs font-medium text-proyectos hover:underline"
                                >
                                  {c.activa ? "Desactivar" : "Activar"}
                                </button>
                              </form>
                              <span className="text-neutral-300">|</span>
                              <form action={eliminarAreaAction}>
                                <button
                                  type="submit"
                                  className="text-xs font-medium text-tienda hover:underline"
                                >
                                  Quitar
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulario Añadir Cobertura */}
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5">
              <h3 className="text-sm font-semibold text-proyectos">Asignar nueva cobertura</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Selecciona un departamento completo o un municipio específico que no esté asignado a otra zona.
              </p>

              <form action={asignarCoberturaAction} className="mt-4 grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="slug" value={zona.codigo} />

                <div>
                  <label htmlFor="ambito" className="block text-xs font-semibold text-neutral-700">
                    Ámbito
                  </label>
                  <select id="ambito" name="ambito" className={`${claseCampo} mt-1 text-sm`}>
                    <option value="departamento">Departamento completo</option>
                    <option value="municipio">Municipio específico</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="cobertura-codigo" className="block text-xs font-semibold text-neutral-700">
                    Localidad disponible
                  </label>
                  <select id="cobertura-codigo" name="codigo" required className={`${claseCampo} mt-1 text-sm`}>
                    <optgroup label="Departamentos disponibles">
                      {todosDeptos.map((d) => (
                        <option key={d.codigo} value={d.codigo}>
                          {d.nombre} ({d.codigo})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Municipios disponibles">
                      {todosMunis.map((m) => (
                        <option key={m.codigo} value={m.codigo}>
                          {m.nombre} ({m.codigo})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-xl bg-proyectos px-5 text-sm font-semibold text-white hover:bg-proyectos/90"
                  >
                    Asignar localidad
                  </button>
                </div>
              </form>
            </div>
          </Seccion>
        </div>

        {/* 3. Tarifas y Precios */}
        <div className="mt-12">
          <Seccion
            titulo="Tarifas de envío"
            descripcion="Cada zona tiene a lo sumo una tarifa publicada vigente. Publicar una nueva cerrará la anterior en el instante actual de forma irreversible."
          >
            {/* Tarifa Vigente Actual */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Tarifa publicada vigente
              </h3>

              {tarifaVigente ? (
                <div className="mt-4 grid gap-6 sm:grid-cols-4">
                  <div>
                    <span className="block text-xs text-neutral-500">Importe de envío</span>
                    <span className="text-2xl font-bold text-neutral-900">
                      {formatPrice(tarifaVigente.importe_cents / 100)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-500">Envío gratis desde</span>
                    <span className="text-lg font-semibold text-emerald-700">
                      {tarifaVigente.umbral_gratis_cents !== null
                        ? formatPrice(tarifaVigente.umbral_gratis_cents / 100)
                        : "Sin envío gratis"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-500">Plazo estimado</span>
                    <span className="text-lg font-semibold text-neutral-800">
                      {tarifaVigente.plazo_min_dias} a {tarifaVigente.plazo_max_dias} días
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-500">Límites de cotización</span>
                    <span className="text-sm text-neutral-700">
                      {tarifaVigente.max_piezas ? `${tarifaVigente.max_piezas} piezas` : "Sin tope piezas"}
                      {" · "}
                      {tarifaVigente.max_importe_cents
                        ? formatPrice(tarifaVigente.max_importe_cents / 100)
                        : "Sin tope monto"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 border border-dashed border-amber-200 bg-amber-50/60 p-4 rounded-xl text-sm text-amber-800">
                  Esta zona no tiene ninguna tarifa publicada vigente. Los pedidos dirigidos a esta zona requerirán cotización manual por WhatsApp.
                </div>
              )}
            </div>

            {/* Formulario Publicar / Reemplazar Tarifa */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
              <h3 className="text-base font-semibold text-proyectos">
                {tarifaVigente ? "Sustituir por una nueva tarifa" : "Publicar primera tarifa"}
              </h3>
              {tarifaVigente ? (
                <p className="mt-1 text-xs text-amber-700 font-medium">
                  Atención: Esta zona ya tiene una tarifa publicada. Publicar la nueva cerrará la anterior ahora mismo.
                </p>
              ) : null}

              <form action={publicarTarifaAction} className="mt-5 grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="slug" value={zona.codigo} />

                <div>
                  <label htmlFor="importeQuetzales" className="block text-xs font-semibold text-neutral-700">
                    Importe en Quetzales (Q) *
                  </label>
                  <input
                    id="importeQuetzales"
                    name="importeQuetzales"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    placeholder="35.00"
                    required
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div>
                  <label htmlFor="umbralGratisQuetzales" className="block text-xs font-semibold text-neutral-700">
                    Envío gratis desde (Q, opcional)
                  </label>
                  <input
                    id="umbralGratisQuetzales"
                    name="umbralGratisQuetzales"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional (ej. 500.00)"
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div>
                  <label htmlFor="maxPiezas" className="block text-xs font-semibold text-neutral-700">
                    Tope de piezas (opcional)
                  </label>
                  <input
                    id="maxPiezas"
                    name="maxPiezas"
                    type="number"
                    min="1"
                    max="999"
                    placeholder="Opcional (ej. 20)"
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div>
                  <label htmlFor="maxImporteQuetzales" className="block text-xs font-semibold text-neutral-700">
                    Tope de subtotal (Q, opcional)
                  </label>
                  <input
                    id="maxImporteQuetzales"
                    name="maxImporteQuetzales"
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Opcional (ej. 5000.00)"
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div>
                  <label htmlFor="plazoMinDias" className="block text-xs font-semibold text-neutral-700">
                    Plazo mínimo (días hábiles)
                  </label>
                  <input
                    id="plazoMinDias"
                    name="plazoMinDias"
                    type="number"
                    defaultValue={2}
                    min="0"
                    max="60"
                    required
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div>
                  <label htmlFor="plazoMaxDias" className="block text-xs font-semibold text-neutral-700">
                    Plazo máximo (días hábiles)
                  </label>
                  <input
                    id="plazoMaxDias"
                    name="plazoMaxDias"
                    type="number"
                    defaultValue={3}
                    min="0"
                    max="60"
                    required
                    className={`${claseCampo} mt-1 text-sm`}
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    className="min-h-11 rounded-full bg-tienda px-6 text-sm font-semibold text-white hover:bg-tienda/90"
                  >
                    Publicar tarifa oficial
                  </button>
                </div>
              </form>
            </div>

            {/* Borradores de Tarifas */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Borradores de tarifas ({borradores.length})
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Tarifas no publicadas que puedes revisar antes de aplicar o descartar.
              </p>

              {borradores.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase text-neutral-600">
                      <tr>
                        <th className="px-4 py-2">Importe</th>
                        <th className="px-4 py-2">Gratis desde</th>
                        <th className="px-4 py-2">Plazo</th>
                        <th className="px-4 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {borradores.map((b) => {
                        const tarifaId = Number(b.id);
                        const borrarBorradorAction = borrarBorradorDeTarifa.bind(null, tarifaId, zona.codigo);

                        return (
                          <tr key={tarifaId}>
                            <td className="px-4 py-2.5 font-semibold text-neutral-900">
                              {formatPrice(b.importe_cents / 100)}
                            </td>
                            <td className="px-4 py-2.5 text-neutral-600">
                              {b.umbral_gratis_cents ? formatPrice(b.umbral_gratis_cents / 100) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-neutral-600">
                              {b.plazo_min_dias} - {b.plazo_max_dias} días
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <form action={borrarBorradorAction} className="inline">
                                <button
                                  type="submit"
                                  className="text-xs font-semibold text-tienda hover:underline"
                                >
                                  Eliminar borrador
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-xs text-neutral-400 italic">No hay borradores guardados.</p>
              )}

              {/* Crear borrador */}
              <div className="mt-6 border-t border-neutral-100 pt-4">
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-proyectos hover:underline">
                    + Guardar nuevo borrador sin publicar
                  </summary>
                  <form action={crearBorradorAction} className="mt-4 grid gap-4 sm:grid-cols-3">
                    <input type="hidden" name="slug" value={zona.codigo} />

                    <div>
                      <label htmlFor="b_importe" className="block text-xs font-semibold text-neutral-700">
                        Importe en Quetzales (Q) *
                      </label>
                      <input
                        id="b_importe"
                        name="importeQuetzales"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="35.00"
                        required
                        className={`${claseCampo} mt-1 text-sm`}
                      />
                    </div>

                    <div>
                      <label htmlFor="b_umbral" className="block text-xs font-semibold text-neutral-700">
                        Envío gratis desde (Q)
                      </label>
                      <input
                        id="b_umbral"
                        name="umbralGratisQuetzales"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Opcional"
                        className={`${claseCampo} mt-1 text-sm`}
                      />
                    </div>

                    <div>
                      <label htmlFor="b_plazoMax" className="block text-xs font-semibold text-neutral-700">
                        Plazo máximo (días)
                      </label>
                      <input
                        id="b_plazoMax"
                        name="plazoMaxDias"
                        type="number"
                        defaultValue={3}
                        min="0"
                        required
                        className={`${claseCampo} mt-1 text-sm`}
                      />
                    </div>

                    <div className="sm:col-span-3 flex justify-end">
                      <button
                        type="submit"
                        className="min-h-10 rounded-xl bg-neutral-800 px-5 text-xs font-semibold text-white hover:bg-black"
                      >
                        Guardar borrador
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </div>

            {/* Historial de Tarifas Anteriores */}
            {cerradas.length > 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Historial de tarifas cerradas (solo lectura)
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 uppercase font-semibold">
                      <tr>
                        <th className="px-3 py-2">Importe</th>
                        <th className="px-3 py-2">Vigente desde</th>
                        <th className="px-3 py-2">Cerrada en</th>
                        <th className="px-3 py-2">Gratis desde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-neutral-600">
                      {cerradas.map((c) => (
                        <tr key={c.id}>
                          <td className="px-3 py-2 font-medium text-neutral-900">
                            {formatPrice(c.importe_cents / 100)}
                          </td>
                          <td className="px-3 py-2">{new Date(c.vigente_desde).toLocaleDateString("es-GT")}</td>
                          <td className="px-3 py-2">
                            {c.vigente_hasta ? new Date(c.vigente_hasta).toLocaleDateString("es-GT") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {c.umbral_gratis_cents ? formatPrice(c.umbral_gratis_cents / 100) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </Seccion>
        </div>

        {/* 4. Peligro: Eliminar Zona */}
        <div className="mt-16 border-t-2 border-red-200 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-red-600">
            Zona de peligro
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Solo es posible eliminar una zona si no tiene coberturas asignadas ni historial de tarifas. Si ya tiene historial o cobertura activa, desactívala.
          </p>
          <div className="mt-4">
            <form action={eliminarZonaAction}>
              <button
                type="submit"
                className="rounded-xl border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Eliminar zona permanentemente
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
