import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensajeDeFaltan, validarDireccion } from "@/app/identidad/direcciones";
import { guardarDireccion, listarDirecciones } from "@/app/identidad/direcciones.server";
import { debeRenovarLaSesion, leerClienteActual } from "@/app/identidad/sesion.server";
import RenovarSesion from "../RenovarSesion";
import FormularioDireccion, { type EstadoDelFormulario } from "./FormularioDireccion";
import geografia from "@/db/datos/geografia-gt.json";

export const metadata = { title: "Mis direcciones · ECONOLUZ" };

async function guardar(
  _previo: EstadoDelFormulario,
  datos: FormData,
): Promise<EstadoDelFormulario> {
  "use server";

  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const resultado = validarDireccion({
    destinatario: datos.get("destinatario"),
    telefono: datos.get("telefono"),
    departamento: datos.get("departamento"),
    municipio: datos.get("municipio"),
    direccion: datos.get("direccion"),
    referencias: datos.get("referencias"),
    predeterminada: datos.get("predeterminada") === "on",
    departamentoCodigo: datos.get("departamentoCodigo"),
    municipioCodigo: datos.get("municipioCodigo"),
    zonaCapitalina: datos.get("zonaCapitalina"),
  });

  // Antes esto era un `return` a secas: la dirección se perdía sin decir nada.
  if (!resultado.ok) {
    return { mensaje: mensajeDeFaltan(resultado.faltan), guardada: false };
  }

  await guardarDireccion(cliente.id, resultado.direccion);
  revalidatePath("/cuenta/direcciones");
  return { mensaje: "", guardada: true };
}

export default async function DireccionesPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const debeRenovar = await debeRenovarLaSesion();
  const direcciones = await listarDirecciones(cliente.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <RenovarSesion debeRenovar={debeRenovar} />
      <h1 className="text-2xl font-semibold text-[#001B59]">Mis direcciones de entrega</h1>

      <ul className="mt-6 space-y-4">
        {direcciones.map((direccion) => (
          <li key={String(direccion.id)} className="rounded border border-neutral-200 p-4 text-sm">
            <p className="font-medium">{String(direccion.destinatario)}</p>
            <p className="text-neutral-600">
              {String(direccion.direccion)}
              {direccion.zona_capitalina ? `, zona ${String(direccion.zona_capitalina)}` : ""},{" "}
              {String(direccion.municipio)}, {String(direccion.departamento)}
            </p>
            {direccion.referencias ? (
              <p className="text-neutral-500">{String(direccion.referencias)}</p>
            ) : null}
            {direccion.predeterminada ? (
              <p className="mt-1 text-xs uppercase text-[#001B59]">Predeterminada</p>
            ) : null}
          </li>
        ))}
        {direcciones.length === 0 ? (
          <li className="text-sm text-neutral-500">Todavía no has guardado ninguna.</li>
        ) : null}
      </ul>

      <FormularioDireccion
        accion={guardar}
        departamentos={geografia.departamentos}
        municipios={geografia.municipios}
      />
    </main>
  );
}
