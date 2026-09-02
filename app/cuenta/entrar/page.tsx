import { redirect } from "next/navigation";
import { leerClienteActual } from "@/app/identidad/sesion.server";
import ClienteFirebase from "../ClienteFirebase";

export const metadata = { title: "Entrar · ECONOLUZ" };

export default async function EntrarPage() {
  if (await leerClienteActual()) {
    redirect("/cuenta");
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-[#001B59]">Entrar a tu cuenta</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Con tu correo o con Google. La necesitas para comprar y guardar tus direcciones de
        entrega.
      </p>
      <ClienteFirebase />
    </main>
  );
}
