import { verificarSesion } from "../auth/authorization.server";

// Depende de la cookie: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  // Se vuelve a verificar aquí, junto a los datos, no solo en el layout.
  const usuario = await verificarSesion();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-tienda">
          Panel de administración
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-proyectos sm:text-4xl">
          Hola, {usuario.name}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-proyectos/70">
          Desde aquí se administrará el contenido de la web sin tocar código. El acceso ya
          está protegido; las pantallas de contenido llegan en los siguientes pasos.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="rounded-2xl border border-proyectos/15 p-6">
          <p className="text-sm font-semibold text-proyectos">Productos</p>
          <p className="mt-2 text-sm text-proyectos/65">
            Listar, editar, publicar, poner precio y existencias. En construcción.
          </p>
        </li>
        <li className="rounded-2xl border border-proyectos/15 p-6">
          <p className="text-sm font-semibold text-proyectos">Galería de proyectos</p>
          <p className="mt-2 text-sm text-proyectos/65">
            Mismo tratamiento que los productos. En construcción.
          </p>
        </li>
      </ul>
    </div>
  );
}
