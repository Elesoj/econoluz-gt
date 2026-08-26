import Link from "next/link";
import { verificarSesion } from "../../../auth/authorization.server";
import { createProjectAction } from "../../../proyectos/actions";
import { getProjectTypes } from "../../../proyectos/repository.server";

export const dynamic = "force-dynamic";

const field = "min-h-11 rounded-xl border border-proyectos/25 px-4 text-base text-proyectos";
const label = "text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await verificarSesion();
  const [types, search] = await Promise.all([getProjectTypes(), searchParams]);

  return (
    <>
      <section className="bg-proyectos text-white">
        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
          <Link href="/admin/proyectos" className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60 hover:text-white">← Proyectos</Link>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Proyecto nuevo</h1>
          <p className="mt-3 text-white/75">Se crea oculto. Después podrás añadir fotografías y publicarlo.</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        {search.error ? <p role="alert" className="mb-6 border-l-2 border-error bg-neutral-50 px-4 py-3 text-sm text-error">{search.error}</p> : null}
        <form action={createProjectAction} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className={label}>Título</label>
            <input id="title" name="title" required className={field} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="type" className={label}>Tipo</label>
            <input id="type" name="type" list="project-types" required className={field} />
            <datalist id="project-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="description" className={label}>Descripción</label>
            <textarea id="description" name="description" rows={6} required className={`${field} py-3`} />
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-5">
            <Link href="/admin/proyectos" className="text-sm font-semibold text-neutral-600">Cancelar</Link>
            <button className="min-h-11 rounded-full bg-tienda px-7 text-sm font-semibold text-white transition hover:bg-tienda-fuerte">Crear proyecto</button>
          </div>
        </form>
      </div>
    </>
  );
}

