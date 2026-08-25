import Image from "next/image";
import Link from "next/link";
import { productTypes } from "../../../data/catalogTaxonomy";
import { verificarSesion } from "../../auth/authorization.server";
import { guardarProductos } from "../../productos/actions";
import { PRODUCTOS_POR_PAGINA, type EstadoProducto } from "../../productos/list";
import { getProductosAdmin } from "../../productos/list.server";

// Depende de la cookie y de los filtros: no se puede prerenderizar.
export const dynamic = "force-dynamic";

const ESTADOS: { valor: EstadoProducto; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "publicados", etiqueta: "Publicados" },
  { valor: "ocultos", etiqueta: "Sin publicar" },
  { valor: "sin_precio", etiqueta: "Sin precio" },
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

  const { productos, total, paginas } = await getProductosAdmin({
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

  const guardados = Number(unTexto(parametros.guardados));
  const errores = unTexto(parametros.errores);
  const desde = total === 0 ? 0 : (pagina - 1) * PRODUCTOS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * PRODUCTOS_POR_PAGINA, total);

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
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Productos</h1>
          <p className="mt-3 text-white/75">
            Escribe el precio y las existencias directamente en la fila, y guarda todos los
            cambios de la página de una vez.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {/* Filtros. Van por GET para que la búsqueda quede en la dirección y se
            pueda recargar, compartir o volver atrás sin perderla. */}
        <form action="/admin/productos" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-2">
            <label htmlFor="busqueda" className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Buscar por nombre o referencia
            </label>
            <input
              id="busqueda"
              name="busqueda"
              type="search"
              defaultValue={busqueda}
              placeholder="ECO-CAT-0132, panel, tira…"
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
              <option value="">Todos</option>
              {Object.values(productTypes).map((valor) => (
                <option key={valor.id} value={valor.id}>
                  {valor.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="estado" className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Estado
            </label>
            <select
              id="estado"
              name="estado"
              defaultValue={estado}
              className="min-h-11 rounded-xl border border-proyectos/25 px-3 text-base text-proyectos"
            >
              {ESTADOS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
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

        {guardados > 0 ? (
          <p className="mt-6 border-l-2 border-proyectos bg-neutral-50 px-4 py-3 text-sm text-proyectos">
            {guardados === 1 ? "Se guardó 1 producto." : `Se guardaron ${guardados} productos.`}{" "}
            El catálogo de la web ya muestra el cambio.
          </p>
        ) : null}

        {errores ? (
          <p className="mt-4 border-l-2 border-error bg-neutral-50 px-4 py-3 text-sm text-error">
            No se guardó todo: {errores}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-neutral-600">
          {total === 0
            ? "Ningún producto coincide con esos filtros."
            : `Mostrando ${desde}–${hasta} de ${total}`}
        </p>

        {productos.length > 0 ? (
          <form action={guardarProductos} className="mt-4">
            <input type="hidden" name="volverA" value={filtrosActuales.toString()} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] border-collapse text-left">
                <thead>
                  <tr className="bg-proyectos text-xs uppercase tracking-[0.18em] text-white">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Precio (Q)</th>
                    <th className="px-4 py-3 font-semibold">Existencias</th>
                    <th className="px-4 py-3 text-center font-semibold">Publicado</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((producto) => (
                    <tr key={producto.referencia} className="border-b border-neutral-200 align-middle">
                      <td className="px-4 py-3">
                        {/* La referencia identifica la fila en el formulario:
                            el identificador interno lleva el nombre del
                            proveedor y no puede salir en el HTML. */}
                        <input type="hidden" name="referencia" value={producto.referencia} />
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
                            <p className="truncate font-semibold text-proyectos">{producto.nombre}</p>
                            <p className="font-mono text-xs text-neutral-500">{producto.referencia}</p>
                          </div>
                        </div>
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

            {/* La barra se queda pegada abajo: con veinticinco filas, un botón
                al final de la página obliga a bajar cada vez. */}
            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white/95 py-4 backdrop-blur">
              <p className="text-sm text-neutral-600">
                Cambia un producto o los que quieras: se guarda solo lo que hayas tocado.
              </p>
              <button
                type="submit"
                className="min-h-11 rounded-full bg-tienda px-7 text-sm font-semibold text-white transition duration-300 hover:bg-tienda-fuerte"
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
