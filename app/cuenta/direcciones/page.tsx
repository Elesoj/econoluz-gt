import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validarDireccion } from "@/app/identidad/direcciones";
import { guardarDireccion, listarDirecciones } from "@/app/identidad/direcciones.server";
import { leerClienteActual } from "@/app/identidad/sesion.server";

export const metadata = { title: "Mis direcciones · ECONOLUZ" };

async function guardar(datos: FormData) {
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
  });

  if (!resultado.ok) return;

  await guardarDireccion(cliente.id, resultado.direccion);
  revalidatePath("/cuenta/direcciones");
}

export default async function DireccionesPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const direcciones = await listarDirecciones(cliente.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-[#001B59]">Mis direcciones de entrega</h1>

      <ul className="mt-6 space-y-4">
        {direcciones.map((direccion) => (
          <li key={String(direccion.id)} className="rounded border border-neutral-200 p-4 text-sm">
            <p className="font-medium">{String(direccion.destinatario)}</p>
            <p className="text-neutral-600">
              {String(direccion.direccion)}, {String(direccion.municipio)},{" "}
              {String(direccion.departamento)}
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

      <form action={guardar} className="mt-10 space-y-3">
        <h2 className="text-lg font-medium text-[#001B59]">Agregar una dirección</h2>
        {[
          ["destinatario", "Quién recibe", "text"],
          ["telefono", "Teléfono", "tel"],
          ["departamento", "Departamento", "text"],
          ["municipio", "Municipio", "text"],
          ["direccion", "Dirección", "text"],
        ].map(([nombre, etiqueta, tipo]) => (
          <label key={nombre} className="block text-sm text-neutral-700">
            {etiqueta}
            <input
              type={tipo}
              name={nombre}
              required
              placeholder={nombre === "telefono" ? "4042 8790" : undefined}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
        ))}
        <label className="block text-sm text-neutral-700">
          Referencias para encontrarla
          <input
            name="referencias"
            placeholder="Portón negro frente a la tienda"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="predeterminada" />
          Usar como predeterminada
        </label>
        <button type="submit" className="rounded bg-[#E11133] px-4 py-3 font-medium text-white">
          Guardar dirección
        </button>
      </form>
    </main>
  );
}
