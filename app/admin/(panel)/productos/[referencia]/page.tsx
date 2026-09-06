import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { verificarSesion } from "../../../auth/authorization.server";
import { guardarFicha } from "../../../productos/actions";
import { CAMPOS_FICHA_TECNICA, lineasDesdeLista } from "../../../productos/ficha";
import { getProductoFicha } from "../../../productos/ficha.server";
import SelectorTipoAplicacion from "../SelectorTipoAplicacion";
import SelectorAcabado from "../SelectorAcabado";
import ComboboxEditable from "../ComboboxEditable";
import ModalAvisoOperacion from "../ModalAvisoOperacion";
import { SUGERENCIAS_ESPECIFICACIONES } from "../sugerenciasSpecs";

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

export default async function FichaProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ referencia: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verificarSesion();

  const { referencia } = await params;
  const consulta = await searchParams;
  const producto = await getProductoFicha(decodeURIComponent(referencia));

  if (!producto) {
    notFound();
  }

  const error = typeof consulta.error === "string" ? consulta.error : "";
  const guardado = consulta.guardado === "1";
  const creado = consulta.creado === "1";

  return (
    <>
      <ModalAvisoOperacion
        guardado={guardado}
        creado={creado}
        errores={error}
      />

      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
          <Link
            href="/admin/productos"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white"
          >
            ← Productos
          </Link>
          <p className="mt-4 font-mono text-sm text-white/70">{producto.referencia}</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{producto.nombre}</h1>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <form action={guardarFicha} className="flex flex-col gap-9">
          <input type="hidden" name="referencia" value={producto.referencia} />

          <Seccion titulo="Lo que ve el cliente">
            <div className="flex flex-col gap-2">
              <label htmlFor="nombre" className={claseEtiqueta}>
                Nombre
              </label>
              <input id="nombre" name="nombre" defaultValue={producto.nombre} className={claseCampo} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="descripcion" className={claseEtiqueta}>
                Descripción
              </label>
              <textarea
                id="descripcion"
                name="descripcion"
                rows={4}
                defaultValue={producto.descripcion}
                className={claseArea}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Foto principal"
            descripcion="Sube una foto nueva desde tu computadora o deja la que está. Máximo 4 MB, en webp, jpg o png."
          >
            <div className="flex flex-wrap items-start gap-5">
              <Image
                src={producto.imagen}
                alt=""
                width={140}
                height={140}
                className="h-32 w-32 rounded-xl border border-neutral-200 object-cover"
              />
              <div className="flex min-w-[16rem] flex-1 flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="foto" className={claseEtiqueta}>
                    Subir una foto nueva
                  </label>
                  <input
                    id="foto"
                    name="foto"
                    type="file"
                    accept="image/webp,image/jpeg,image/png,image/avif"
                    className="text-sm text-neutral-600 file:mr-4 file:min-h-11 file:rounded-full file:border file:border-proyectos/30 file:bg-white file:px-5 file:text-sm file:font-semibold file:text-proyectos"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="imagen" className={claseEtiqueta}>
                    O la ruta de la foto actual
                  </label>
                  <input
                    id="imagen"
                    name="imagen"
                    defaultValue={producto.imagen}
                    className={`${claseCampo} font-mono text-sm`}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="galeria" className={claseEtiqueta}>
                Galería, una ruta por renglón
              </label>
              <textarea
                id="galeria"
                name="galeria"
                rows={3}
                defaultValue={producto.galeria.join("\n")}
                className={`${claseArea} font-mono text-sm`}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Clasificación y Acabado"
            descripcion="La aplicación se sincroniza automáticamente con el tipo elegido para garantizar que el producto aparezca en los filtros del catálogo."
          >
            <SelectorTipoAplicacion
              tipoInicial={producto.tipo}
              aplicacionInicial={producto.aplicacion}
              familiaInicial={producto.familia}
            />

            <div className="mt-2 grid gap-5 sm:grid-cols-2">
              <SelectorAcabado
                acabadoInicial={producto.acabado}
                acabadoEtiquetaInicial={producto.acabadoEtiqueta}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Ficha técnica"
            descripcion="Lo que dejes vacío no aparece en la web. Puedes seleccionar opciones recomendadas o escribir libremente."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPOS_FICHA_TECNICA.map((campo) => {
                const sugerencias = SUGERENCIAS_ESPECIFICACIONES[campo.clave];
                const valorActual = String(producto.fichaTecnica[campo.clave] ?? "");

                if (sugerencias && sugerencias.length > 0) {
                  return (
                    <ComboboxEditable
                      key={campo.clave}
                      name={`spec_${campo.clave}`}
                      etiqueta={campo.etiqueta}
                      ayuda={campo.ayuda}
                      defaultValue={valorActual}
                      sugerencias={sugerencias}
                    />
                  );
                }

                return (
                  <div key={campo.clave} className="flex flex-col gap-2">
                    <label htmlFor={`spec_${campo.clave}`} className={claseEtiqueta}>
                      {campo.etiqueta}
                    </label>
                    <input
                      id={`spec_${campo.clave}`}
                      name={`spec_${campo.clave}`}
                      defaultValue={valorActual}
                      placeholder={campo.ayuda}
                      className={claseCampo}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="caracteristicas" className={claseEtiqueta}>
                Características especiales, una por renglón
              </label>
              <textarea
                id="caracteristicas"
                name="caracteristicas"
                rows={5}
                defaultValue={lineasDesdeLista(producto.fichaTecnica.specialFeatures)}
                className={claseArea}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Proveedor · interno"
            descripcion="Esto no llega nunca al catálogo público. La marca y la serie no se editan aquí todavía."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className={claseEtiqueta}>Marca</span>
                <p className="min-h-11 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500">
                  {producto.proveedorMarca || "—"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className={claseEtiqueta}>Serie</span>
                <p className="min-h-11 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500">
                  {producto.proveedorSerie || "—"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="proveedorCodigo" className={claseEtiqueta}>
                  Código del fabricante / proveedor
                </label>
                <input
                  id="proveedorCodigo"
                  name="proveedorCodigo"
                  defaultValue={producto.proveedorCodigo}
                  placeholder="Obligatorio para publicar"
                  className={claseCampo}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="proveedorNombre" className={claseEtiqueta}>
                  Nombre del fabricante
                </label>
                <input
                  id="proveedorNombre"
                  name="proveedorNombre"
                  defaultValue={producto.proveedorNombre}
                  className={claseCampo}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="proveedorDescripcion" className={claseEtiqueta}>
                Descripción del fabricante
              </label>
              <textarea
                id="proveedorDescripcion"
                name="proveedorDescripcion"
                rows={3}
                defaultValue={producto.proveedorDescripcion}
                className={claseArea}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Tienda y publicación"
            descripcion="Un producto publicado con precio aparece a la venta. Si se deja vacío, muestra «Consultar precio» y lleva a la asesoría. El cambio se nota al momento."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="precio" className={claseEtiqueta}>
                  Precio en quetzales
                </label>
                <input
                  id="precio"
                  name="precio"
                  inputMode="decimal"
                  defaultValue={producto.precio === null ? "" : String(producto.precio)}
                  placeholder="Sin precio"
                  className={claseCampo}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="existencias" className={claseEtiqueta}>
                  Existencias
                </label>
                <input
                  id="existencias"
                  name="existencias"
                  inputMode="numeric"
                  defaultValue={producto.existencias === null ? "" : String(producto.existencias)}
                  placeholder="Sin control de existencias"
                  className={claseCampo}
                />
              </div>
            </div>

            <p className="border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
              Un producto con precio se puede comprar desde la web. Si todavía no
              quieres venderlo en línea, déjalo sin precio: seguirá en el
              catálogo, y quien lo vea pedirá asesoría.
            </p>

            <label className="flex items-center gap-3 text-sm text-proyectos">
              <input
                type="checkbox"
                name="publicado"
                defaultChecked={producto.publicado}
                className="h-5 w-5 accent-[color:var(--tienda)]"
              />
              Publicado: se ve en el catálogo de la web (requiere código del fabricante)
            </label>
          </Seccion>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white/95 py-4 backdrop-blur">
            <Link href="/admin/productos" className="text-sm font-semibold text-neutral-600">
              Volver sin guardar
            </Link>
            <button
              type="submit"
              className="min-h-11 rounded-full bg-tienda px-7 text-sm font-semibold text-white transition duration-300 hover:bg-tienda-fuerte"
            >
              Guardar producto
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
