import Image from "next/image";
import { redirect } from "next/navigation";
import { leerSesion } from "../auth/authorization.server";
import LoginForm from "./LoginForm";

// Depende de la cookie: no se puede prerenderizar.
export const dynamic = "force-dynamic";

export default async function EntrarPage() {
  // Quien ya tiene sesión no necesita volver a escribir la contraseña.
  if ((await leerSesion()).status === "valid") {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-proyectos px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo_econoluz.png"
            alt="ECONOLUZ GT"
            width={180}
            height={52}
            className="h-11 w-auto"
            priority
          />
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-proyectos-claro">
            Administración interna
          </p>
        </div>

        <div className="rounded-3xl bg-white p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-9">
          <h1 className="text-2xl font-semibold text-proyectos">Acceso al panel</h1>
          <p className="mt-2 mb-7 text-sm text-proyectos/70">
            Esta zona administra el catálogo de la web. Si no tienes credenciales, no
            necesitas entrar aquí.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/60">ECONOLUZ GT · Guatemala</p>
      </div>
    </main>
  );
}
