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
      <header className="bg-proyectos text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
          <Image
            src="/logo_econoluz.png"
            alt="ECONOLUZ GT"
            width={180}
            height={52}
            className="h-9 w-auto"
            priority
          />
          <span className="border-l border-tienda-claro pl-4 text-xs font-semibold uppercase tracking-[0.28em] text-proyectos-claro">
            Panel
          </span>
          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-sm text-white/75 sm:inline">{usuario.name}</span>
            <form action={salir}>
              <button
                type="submit"
                className="min-h-11 rounded-full border border-white/35 px-5 text-sm font-semibold text-white transition duration-300 hover:bg-white/10"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">{children}</main>

      <SessionActivity />
    </div>
  );
}
