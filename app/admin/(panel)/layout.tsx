import Image from "next/image";
import { salir } from "../actions";
import { verificarSesion } from "../auth/authorization.server";
import SessionActivity from "../SessionActivity";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Comodidad, no barrera: redirige pronto y da nombre a la cabecera. La
  // frontera real es `verificarSesion()` dentro de cada página y cada acción,
  // porque un layout no se vuelve a renderizar al cambiar de ruta.
  const usuario = await verificarSesion();

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* Cabecera blanca, como la barra del sitio público: el logo lleva azul
          marino y sobre una superficie azul marino se pierde. */}
      <header className="border-b border-neutral-200 bg-white text-proyectos">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
          <Image
            src="/logo_econoluz.png"
            alt="ECONOLUZ GT"
            width={180}
            height={52}
            className="h-9 w-auto"
            priority
          />
          <span className="border-l border-tienda pl-4 text-xs font-semibold uppercase tracking-[0.28em] text-tienda">
            Panel
          </span>
          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-sm text-neutral-600 sm:inline">{usuario.name}</span>
            <form action={salir}>
              <button
                type="submit"
                className="min-h-11 rounded-full border border-proyectos/30 px-5 text-sm font-semibold text-proyectos transition duration-300 hover:bg-proyectos hover:text-white"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Sin ancho ni margen aquí: cada pantalla decide, porque las franjas de
          color van a todo el ancho y el contenido no. */}
      <main className="flex-1">{children}</main>

      <SessionActivity />
    </div>
  );
}
