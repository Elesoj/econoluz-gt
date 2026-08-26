import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { verificarSesion } from "../../../auth/authorization.server";
import { saveProjectAction, setProjectPublishedAction } from "../../../proyectos/actions";
import { getAdminProject, getProjectTypes } from "../../../proyectos/repository.server";

export const dynamic = "force-dynamic";

const field = "min-h-11 rounded-xl border border-proyectos/25 px-4 text-base text-proyectos";
const label = "text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500";
type Search = { saved?: string; created?: string; error?: string };

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await verificarSesion();
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const [project, types] = await Promise.all([getAdminProject(id), getProjectTypes()]);
  if (!project) notFound();

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
          <Link href="/admin/proyectos" className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white">← Proyectos</Link>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">{project.title}</h1>
          <p className="mt-3 text-white/75">{project.published ? "Publicado en la web" : "Todavía no se muestra en la web"}</p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          {search.saved || search.created ? <p className="mb-6 border-l-2 border-proyectos bg-neutral-50 px-4 py-3 text-sm text-proyectos">{search.created ? "Proyecto creado. Añade sus fotografías antes de publicarlo." : "Proyecto guardado. La web ya muestra el cambio."}</p> : null}
          {search.error ? <p role="alert" className="mb-6 border-l-2 border-error bg-neutral-50 px-4 py-3 text-sm text-error">{search.error}</p> : null}

          <form action={saveProjectAction} className="flex flex-col gap-6">
            <input type="hidden" name="id" value={project.id} />
            <div className="flex flex-col gap-2">
              <label htmlFor="title" className={label}>Título</label>
              <input id="title" name="title" required defaultValue={project.title} className={field} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="type" className={label}>Tipo</label>
              <input id="type" name="type" list="project-types" required defaultValue={project.type} className={field} />
              <datalist id="project-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="description" className={label}>Descripción</label>
              <textarea id="description" name="description" rows={7} required defaultValue={project.description} className={`${field} py-3`} />
            </div>
            <button className="min-h-11 self-end rounded-full bg-tienda px-7 text-sm font-semibold text-white transition hover:bg-tienda-fuerte">Guardar proyecto</button>
          </form>

          <section className="mt-12 border-t border-neutral-200 pt-8">
            <h2 className="text-2xl font-semibold text-proyectos">Fotografías</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">La primera fotografía visible será la imagen inicial. Los controles de carga y orden se activan en el siguiente bloque.</p>
            {project.images.length > 0 ? (
              <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {project.images.map((image) => (
                  <li key={image.id} className="relative">
                    <Image src={image.url} alt="" width={320} height={220} className={`aspect-[4/3] w-full object-cover ${image.visible ? "" : "opacity-35"}`} />
                    <span className="mt-2 block text-xs text-neutral-500">{image.visible ? "Visible" : "Oculta"}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="mt-5 bg-proyectos/8 px-5 py-8 text-sm text-proyectos">Sin fotografías todavía.</div>}
          </section>
        </div>

        <aside className="h-fit border-t-2 border-proyectos bg-neutral-50 p-5">
          <h2 className="text-lg font-semibold text-proyectos">Publicación</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">No se puede publicar sin al menos una fotografía visible.</p>
          <p className="mt-3 text-sm font-semibold text-proyectos">{project.visibleImages} visibles de {project.totalImages}</p>
          <form action={setProjectPublishedAction} className="mt-5">
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="published" value={String(!project.published)} />
            <input type="hidden" name="origin" value={`/admin/proyectos/${project.id}`} />
            <button className="min-h-11 w-full rounded-full border border-proyectos/30 px-5 text-sm font-semibold text-proyectos transition hover:bg-proyectos hover:text-white">{project.published ? "Ocultar de la web" : "Publicar en la web"}</button>
          </form>
        </aside>
      </div>
    </>
  );
}

