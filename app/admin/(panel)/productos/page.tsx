import Image from "next/image";
import Link from "next/link";
import { productTypes } from "../../../data/catalogTaxonomy";
import { verificarSesion } from "../../auth/authorization.server";
import { guardarProductos } from "../../productos/actions";
import { PRODUCTOS_POR_PAGINA, type EstadoProducto } from "../../productos/list";
import { getProductosAdmin } from "../../productos/list.server";
import ModalAvisoOperacion from "./ModalAvisoOperacion";

// Depende de la cookie y de los filtros: no se puede prerenderizar.
export const dynamic = "force-dynamic";

const PESTANAS: { valor: EstadoProducto; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "publicados", etiqueta: "Publicados" },
  { valor: "ocultos", etiqueta: "Sin publicar" },
  { valor: "incompletos", etiqueta: "Necesitan completar" },
];

type Busqueda = Record<string, string | string[] | undefined>;

function unTexto(valor: string | string[] | undefined) {
  return typeof valor === "string" ? valor : "";
}

/** El precio se escribe y se compara siempre con el mismo formato. */
function comoTexto(valor: number | null) {
  return valor === null ? "" : String(valor);
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<Busqueda>;
}) {
  await verificarSesion();

  const parametros = await searchParams;
  const busqueda = unTexto(parametros.busqueda);
  const tipo = unTexto(parametros.tipo);
  const estado = (unTexto(parametros.estado) || "todos") as EstadoProducto;
  const pagina = Number(unTexto(parametros.pagina)) || 1;

  const { productos, total, contadores, paginas } = await getProductosAdmin({
    busqueda,
    tipo,
    estado,
    pagina,
  });

  // Los filtros con los que volver aquí después de guardar.
  const filtrosActuales = new URLSearchParams();
  if (busqueda) filtrosActuales.set("busqueda", busqueda);
  if (tipo) filtrosActuales.set("tipo", tipo);
  if (estado !== "todos") filtrosActuales.set("estado", estado);
  if (pagina > 1) filtrosActuales.set("pagina", String(pagina));

  const enlaceDePagina = (destino: number) => {
    const copia = new URLSearchParams(filtrosActuales);
    copia.set("pagina", String(destino));
    return `/admin/productos?${copia.toString()}`;
  };

  const enlaceDePestana = (nuevoEstado: EstadoProducto) => {
    const copia = new URLSearchParams(filtrosActuales);
    if (nuevoEstado === "todos") {
      copia.delete("estado");
    } else {
      copia.set("estado", nuevoEstado);
    }
    copia.delete("pagina");
    return `/admin/productos?${copia.toString()}`;
  };

  const guardados = Number(unTexto(parametros.guardados));
  const errores = unTexto(parametros.errores);
  const desde = total === 0 ? 0 : (pagina - 1) * PRODUCTOS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * PRODUCTOS_POR_PAGINA, total);

  return (
    <>
      <ModalAvisoOperacion guardados={guardados} errores={errores} />

      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <Link
            href="/admin"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white"
          >
            ← Panel
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold sm:text-4xl">Productos</h1>
            <Link
              href="/admin/productos/nuevo"
              className="min-h-11 rounded-full bg-tienda px-6 py-3 text-sm font-semibold text-white transition duration-300 hover:bg-tienda-fuerte"
            >
              Nuevo producto
            </Link>
          </div>
          <p className="mt-3 text-white/75">
            Escribe el precio y las existencias directamente en la fila, y guarda todos los
            cambios de la página de una vez. Pulsa el nombre para abrir su ficha completa.
          </p>
          <p className="mt-3 max-w-2xl border-l-2 border-tienda-claro pl-4 text-sm text-white/70">
            <strong className="font-semibold text-white">Un producto publicado con precio
            aparece a la venta.</strong> Si se deja vacío, muestra «Consultar precio» y lleva a
            la asesoría. Publicar, despublicar y cambiar el precio se notan al momento.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {/* Pestañas de estado con contadores sin N+1 */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-neutral-200 pb-4" role="tablist" aria-label="Filtro por estado de producto">
          {PESTANAS.map((pestana) => {
            const activa = estado === pestana.valor;
            const cuenta =
              pestana.valor === "todos"
                ? contadores.todos
                : pestana.valor === "publicados"
                  ? contadores.publicados
                  : pestana.valor === "ocultos"
                    ? contadores.ocultos
                    : contadores.incompletos;

            return (
              <Link
                key={pestana.valor}
                href={enlaceDePestana(pestana.valor)}
                role="tab"
                aria-selected={activa}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
                  activa
                    ? "bg-proyectos text-white shadow-xs"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                <span>{pestana.etiqueta}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    activa
                      ? "bg-white/20 text-white"
                      : "bg-neutral-200 text-neutral-700"
                  }`}
                >
                  {cuenta}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Filtros. Van por GET para que la búsqueda quede en la dirección */}
        <form action="/admin/productos" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="estado" value={estado} />

          <div className="flex min-w-[14rem] flex-1 flex-col gap-2">
            <label htmlFor="busqueda" className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Buscar por nombre, referencia o código fabricante
            </label>
            <input
              id="busqueda"
              name="busqueda"
              type="search"
              defaultValue={busqueda}
              placeholder="ECO-CAT-0132, panel, código de fabricante…"
              className="min-h-11 rounded-xl border border-proyectos/25 px-4 text-base text-proyectos"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="tipo" className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Tipo
            </label>
            <select
              id="tipo"
              name="tipo"
              defaultValue={tipo}
              className="min-h-11 rounded-xl border border-proyectos/25 px-3 text-base text-proyectos"
            >
              <option value="">Todos los tipos</option>
              {Object.values(productTypes).map((valor) => (
                <option key={valor.id} value={valor.id}>
                  {valor.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="min-h-11 rounded-full border border-proyectos/30 px-6 text-sm font-semibold text-proyectos transition duration-300 hover:bg-proyectos hover:text-white"
          >
            Filtrar
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-600">
          {total === 0
            ? "Ningún producto coincide con esos filtros."
            : `Mostrando ${desde}–${hasta} de ${total}`}
        </p>

        {productos.length > 0 ? (
          <form action={guardarProductos} className="mt-4">
            <input type="hidden" name="volverA" value={filtrosActuales.toString()} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-left">
                <thead>
                  <tr className="bg-proyectos text-xs uppercase tracking-[0.18em] text-white">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Cód. Fabricante</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Precio (Q)</th>
                    <th className="px-4 py-3 font-semibold">Existencias</th>
                    <th className="px-4 py-3 text-center font-semibold">Publicado</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((producto) => (
                    <tr
                      key={producto.referencia}
                      className={`border-b border-neutral-200 align-middle ${
                        producto.incompleto ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input type="hidden" name="referencia" value={producto.referencia} />
                        <input
                          type="hidden"
                          name={`proveedorCodigo_${producto.referencia}`}
                          value={producto.proveedorCodigo ?? ""}
                        />
                        <input
                          type="hidden"
                          name={`original_${producto.referencia}`}
                          value={`${comoTexto(producto.precio)}|${comoTexto(producto.existencias)}|${producto.publicado}`}
                        />
                        <div className="flex items-center gap-3">
                          <Image
                            src={producto.imagen}
                            alt=""
                            width={48}
                            height={48}
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/admin/productos/${producto.referencia}`}
                              className="block truncate font-semibold text-proyectos underline-offset-4 hover:underline"
                            >
                              {producto.nombre}
                            </Link>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-neutral-500">{producto.referencia}</span>
                              {producto.incompleto ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-semibold text-amber-800"
                                  title={producto.motivoIncompleto}
                                >
                                  Incompleto
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="font-mono text-xs text-neutral-600">
                          {producto.proveedorCodigo || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{producto.tipoEtiqueta}</td>
                      <td className="px-4 py-3">
                        <input
                          name={`precio_${producto.referencia}`}
                          defaultValue={comoTexto(producto.precio)}
                          inputMode="decimal"
                          aria-label={`Precio de ${producto.referencia}`}
                          placeholder="—"
                          className="min-h-11 w-28 rounded-lg border border-proyectos/25 px-3 text-right tabular-nums text-proyectos"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          name={`existencias_${producto.referencia}`}
                          defaultValue={comoTexto(producto.existencias)}
                          inputMode="numeric"
                          aria-label={`Existencias de ${producto.referencia}`}
                          placeholder="—"
                          className="min-h-11 w-24 rounded-lg border border-proyectos/25 px-3 text-right tabular-nums text-proyectos"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          name={`publicado_${producto.referencia}`}
                          defaultChecked={producto.publicado}
                          aria-label={`Publicar ${producto.referencia}`}
                          className="h-5 w-5 accent-[color:var(--tienda)]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white/95 py-4 backdrop-blur">
              <p className="text-sm text-neutral-600">
                Cambia un producto o los que quieras: se guarda solo lo que hayas tocado.
              </p>
              <button
                type="submit"
                className="min-h-11 rounded-full bg-proyectos px-7 text-sm font-semibold text-white transition duration-300 hover:bg-proyectos-fuerte"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        ) : null}

        {paginas > 1 ? (
          <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Paginación">
            {pagina > 1 ? (
              <Link
                href={enlaceDePagina(pagina - 1)}
                className="min-h-11 rounded-full border border-proyectos/30 px-5 py-3 text-sm font-semibold text-proyectos"
              >
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-neutral-600">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas ? (
              <Link
                href={enlaceDePagina(pagina + 1)}
                className="min-h-11 rounded-full border border-proyectos/30 px-5 py-3 text-sm font-semibold text-proyectos"
              >
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </>
  );
}
