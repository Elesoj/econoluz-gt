import Link from "next/link";
import { formatNumber } from "../../lib/formatters";
import { verificarSesion } from "../auth/authorization.server";
import { getCatalogStats } from "../panelStats.server";

// Depende de la cookie: no se puede prerenderizar.
export const dynamic = "force-dynamic";

const SECCIONES = [
  {
    titulo: "Productos",
    descripcion: "Buscar, poner precio y existencias, publicar y ocultar.",
    estado: "Disponible",
    href: "/admin/productos",
  },
  {
    titulo: "Galería de proyectos",
    descripcion: "Crear, ordenar y publicar obras y sus fotografías.",
    estado: "Disponible",
    href: "/admin/proyectos",
  },
  {
    titulo: "Envíos",
    descripcion:
      "Tarifa del mensajero propio, umbral de envío gratis y qué zona atiende cada método.",
    estado: "Disponible",
    href: "/admin/envios",
  },
];

export default async function PanelPage() {
  // Se vuelve a verificar aquí, junto a los datos, no solo en el layout.
  const usuario = await verificarSesion();
  const stats = await getCatalogStats();

  const cifras = stats
    ? [
        { etiqueta: "Productos en el catálogo", valor: stats.total, nota: null },
        {
          etiqueta: "Publicados en la web",
          valor: stats.publicados,
          nota:
            stats.total > stats.publicados
              ? `${formatNumber(stats.total - stats.publicados)} sin publicar`
              : "todos visibles",
        },
        {
          etiqueta: "Con precio puesto",
          valor: stats.conPrecio,
          nota:
            stats.total > stats.conPrecio
              ? `faltan ${formatNumber(stats.total - stats.conPrecio)}`
              : "catálogo completo",
        },
      ]
    : [];

  return (
    <>
      {/* El azul marino sí admite superficie: es lo que da peso a la portada y
          la diferencia de una pantalla blanca cualquiera. CLAUDE.md §3. */}
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <h1 className="text-3xl font-semibold sm:text-4xl">Hola, {usuario.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
            Desde aquí se administra el contenido de la web sin tocar código. El acceso ya
            está protegido; las pantallas de contenido llegan en los siguientes pasos.
          </p>

          {cifras.length > 0 ? (
            <dl className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
              {cifras.map((cifra) => (
                // El filete rojo es el acento permitido sobre azul marino: como
                // texto no llegaría al contraste mínimo, como filete sí.
                <div key={cifra.etiqueta} className="border-t-2 border-tienda-claro pt-4">
                  <dt className="text-sm text-white/70">{cifra.etiqueta}</dt>
                  <dd className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">
                    {formatNumber(cifra.valor)}
                  </dd>
                  {cifra.nota ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/55">
                      {cifra.nota}
                    </p>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-10 border-t-2 border-tienda-claro pt-4 text-sm text-white/70">
              No se pudo leer el catálogo ahora mismo. El panel funciona igual; vuelve a
              cargar en un momento.
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-tienda">
          Secciones
        </h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2">
          {SECCIONES.map((seccion) => (
            <li key={seccion.titulo}>
              {seccion.href ? (
                <Link
                  href={seccion.href}
                  className="block h-full border-t-2 border-tienda bg-neutral-50 p-6 transition duration-300 hover:bg-white hover:shadow-[0_18px_40px_rgba(0,27,89,0.12)]"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold text-proyectos">{seccion.titulo}</h3>
                    <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-tienda">
                      {seccion.estado}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{seccion.descripcion}</p>
                </Link>
              ) : (
                <div className="h-full border-t-2 border-proyectos/30 bg-neutral-50 p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold text-proyectos">{seccion.titulo}</h3>
                    <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-neutral-500">
                      {seccion.estado}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{seccion.descripcion}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
