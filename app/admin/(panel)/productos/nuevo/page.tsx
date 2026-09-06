import Link from "next/link";
import { verificarSesion } from "../../../auth/authorization.server";
import { crearProductoNuevo } from "../../../productos/actions";
import { CAMPOS_FICHA_TECNICA } from "../../../productos/ficha";
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

const prefijosSugeridosMap: Record<string, string> = {
  placas_accesorios: "ELE",
  iluminacion_industrial: "IND",
  sistemas_lineales_tubos: "TUB",
};

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

export default async function NuevoProductoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verificarSesion();

  const consulta = await searchParams;
  const error = typeof consulta.error === "string" ? consulta.error : "";

  return (
    <>
      <ModalAvisoOperacion errores={error} />

      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
          <Link
            href="/admin/productos"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white"
          >
            ← Productos
          </Link>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Producto nuevo</h1>
          <p className="mt-3 max-w-2xl text-white/75">
            La referencia se pone sola, siguiendo la numeración del catálogo. El precio, las
            existencias y los datos adicionales del fabricante se completan después, en su ficha.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <form action={crearProductoNuevo} className="flex flex-col gap-9">
          <Seccion titulo="Lo que ve el cliente">
            <div className="flex flex-col gap-2">
              <label htmlFor="nombre" className={claseEtiqueta}>
                Nombre
              </label>
              <input id="nombre" name="nombre" required className={claseCampo} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="descripcion" className={claseEtiqueta}>
                Descripción
              </label>
              <textarea id="descripcion" name="descripcion" rows={4} className={claseArea} />
            </div>
          </Seccion>

          <Seccion
            titulo="Foto"
            descripcion="Sube la foto desde tu computadora. Máximo 4 MB, en webp, jpg o png."
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="foto" className={claseEtiqueta}>
                Foto del producto
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
                O la ruta de una foto que ya esté en el sitio
              </label>
              <input
                id="imagen"
                name="imagen"
                placeholder="/catalogos/…"
                className={`${claseCampo} font-mono text-sm`}
              />
            </div>
          </Seccion>

          <Seccion
            titulo="Clasificación y Acabado"
            descripcion="La aplicación se sincroniza automáticamente con el tipo elegido para garantizar que el producto aparezca en los filtros del catálogo."
          >
            <SelectorTipoAplicacion
              tipoInicial="iluminacion_industrial"
              aplicacionInicial="alto_montaje"
              mostrarPrefijo={true}
              prefijosSugeridosMap={prefijosSugeridosMap}
            />

            <div className="mt-2 grid gap-5 sm:grid-cols-2">
              <SelectorAcabado />
            </div>
          </Seccion>

          <Seccion
            titulo="Identificación Interna (Fabricante)"
            descripcion="El código de fabricante es de uso exclusivo del personal interno y no se expone al público. Para publicar el producto es obligatorio ingresarlo."
          >
            <div className="flex flex-col gap-2 sm:w-1/2">
              <label htmlFor="proveedorCodigo" className={claseEtiqueta}>
                Código del fabricante / proveedor
              </label>
              <input
                id="proveedorCodigo"
                name="proveedorCodigo"
                placeholder="Ej. L-450-LED, B001X..."
                className={claseCampo}
              />
              <p className="text-xs text-neutral-500">
                Obligatorio si se marca «Publicado». Opcional si se guarda como borrador.
              </p>
            </div>
          </Seccion>

          <Seccion titulo="Ficha técnica" descripcion="Lo que dejes vacío no aparece en la web. Puedes elegir sugerencias frecuentes o escribir texto libre.">
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPOS_FICHA_TECNICA.map((campo) => {
                const sugerencias = SUGERENCIAS_ESPECIFICACIONES[campo.clave];
                if (sugerencias && sugerencias.length > 0) {
                  return (
                    <ComboboxEditable
                      key={campo.clave}
                      name={`spec_${campo.clave}`}
                      etiqueta={campo.etiqueta}
                      ayuda={campo.ayuda}
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
                className={claseArea}
              />
            </div>
          </Seccion>

          <Seccion titulo="Publicación">
            <label className="flex items-start gap-3 text-sm text-proyectos">
              <input
                type="checkbox"
                name="publicado"
                className="mt-1 h-5 w-5 accent-[color:var(--tienda)]"
              />
              <span>
                Publicarlo en la web ahora mismo.
                <span className="mt-1 block text-neutral-600">
                  Si lo dejas sin marcar, el producto se crea como borrador y no se ve en el catálogo.
                  (Requiere código del fabricante si lo publicas).
                </span>
              </span>
            </label>
          </Seccion>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white/95 py-4 backdrop-blur">
            <Link href="/admin/productos" className="text-sm font-semibold text-neutral-600">
              Cancelar
            </Link>
            <button
              type="submit"
              className="min-h-11 rounded-full bg-tienda px-7 text-sm font-semibold text-white transition duration-300 hover:bg-tienda-fuerte"
            >
              Crear producto
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
