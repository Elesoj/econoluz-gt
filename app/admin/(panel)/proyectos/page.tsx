import Image from "next/image";
import Link from "next/link";
import { verificarSesion } from "../../auth/authorization.server";
import { moveProjectAction, setProjectPublishedAction } from "../../proyectos/actions";
import { getAdminProjects } from "../../proyectos/repository.server";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await verificarSesion();
  const [projects, search] = await Promise.all([getAdminProjects(), searchParams]);
  const error = typeof search.error === "string" ? search.error : "";

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white">
            ← Panel
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold sm:text-4xl">Galería de proyectos</h1>
            <Link href="/admin/proyectos/nuevo" className="min-h-11 rounded-full bg-tienda px-6 py-3 text-sm font-semibold text-white transition hover:bg-tienda-fuerte">
              Nuevo proyecto
            </Link>
          </div>
          <p className="mt-3 max-w-3xl text-white/75">
            Aquí están las obras que aparecen en la web, como BMW, Borghetto y Torre Once.
            Puedes ordenarlas, ocultarlas o abrirlas para cambiar sus datos y fotografías.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {error ? <p role="alert" className="mb-5 border-l-2 border-error bg-neutral-50 px-4 py-3 text-sm text-error">{error}</p> : null}

        <p className="text-sm text-neutral-600">{projects.length} proyectos, en el mismo orden que la web.</p>
        <ul className="mt-5 divide-y divide-neutral-200 border-y border-neutral-200">
          {projects.map((project, index) => (
            <li key={project.id} className="grid gap-5 py-5 lg:grid-cols-[8rem_1fr_auto] lg:items-center">
              {project.coverImage ? (
                <Image src={project.coverImage} alt="" width={256} height={160} className="h-24 w-32 object-cover" />
              ) : (
                <div className="flex h-24 w-32 items-center justify-center bg-proyectos/8 px-3 text-center text-xs font-semibold text-proyectos">
                  Sin fotografías
                </div>
              )}

              <div>
                <Link href={`/admin/proyectos/${project.id}`} className="text-lg font-semibold text-proyectos hover:text-tienda">
                  {project.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-600">{project.type}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
                  {project.visibleImages} visibles de {project.totalImages} · {project.published ? "Publicado" : "Sin publicar"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <form action={moveProjectAction}>
                  <input type="hidden" name="id" value={project.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button disabled={index === 0} className="min-h-11 rounded-full border border-proyectos/30 px-4 text-sm font-semibold text-proyectos disabled:cursor-not-allowed disabled:opacity-35">Subir</button>
                </form>
                <form action={moveProjectAction}>
                  <input type="hidden" name="id" value={project.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button disabled={index === projects.length - 1} className="min-h-11 rounded-full border border-proyectos/30 px-4 text-sm font-semibold text-proyectos disabled:cursor-not-allowed disabled:opacity-35">Bajar</button>
                </form>
                <form action={setProjectPublishedAction}>
                  <input type="hidden" name="id" value={project.id} />
                  <input type="hidden" name="published" value={String(!project.published)} />
                  <input type="hidden" name="origin" value="/admin/proyectos" />
                  <button className="min-h-11 rounded-full border border-proyectos/30 px-4 text-sm font-semibold text-proyectos transition hover:bg-proyectos hover:text-white">
                    {project.published ? "Ocultar" : "Publicar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

