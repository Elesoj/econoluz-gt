import Link from "next/link";
import { redirect } from "next/navigation";
import { debeRenovarLaSesion, leerClienteActual } from "@/app/identidad/sesion.server";
import RenovarSesion from "./RenovarSesion";

export const metadata = { title: "Mi cuenta · ECONOLUZ" };

export default async function CuentaPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const debeRenovar = await debeRenovarLaSesion();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <RenovarSesion debeRenovar={debeRenovar} />
      <h1 className="text-2xl font-semibold text-[#001B59]">Mi cuenta</h1>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-neutral-500">Nombre</dt>
          <dd>{cliente.nombre || "Sin nombre"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-neutral-500">Correo</dt>
          <dd>{cliente.email}</dd>
        </div>
      </dl>

      {cliente.emailVerificado ? null : (
        <p className="mt-4 rounded border border-[#E11133] p-3 text-sm text-[#001B59]">
          Tu correo todavía no está verificado. Podrás navegar y armar tu carrito, pero
          necesitarás verificarlo antes de completar una compra.
        </p>
      )}

      <Link href="/cuenta/direcciones" className="mt-8 inline-block text-[#001B59] underline">
        Mis direcciones de entrega
      </Link>
    </main>
  );
}
