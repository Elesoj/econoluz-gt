import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="bg-white px-5 py-12 text-black sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 border-t border-neutral-200 pt-10 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.8fr_0.9fr_1fr]">
          <div>
            <Image
              src="/logo_econoluz.png"
              alt="ECONOLUZ GT"
              width={180}
              height={52}
              className="h-10 w-auto"
            />
            <p className="mt-5 max-w-xs text-sm leading-6 text-neutral-600">
              Iluminación LED y asesoría para proyectos arquitectónicos en Guatemala.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">Navegación</p>
            <div className="mt-4 grid gap-3 text-sm text-neutral-600">
              <Link href="/#inicio" className="transition hover:text-black">
                Inicio
              </Link>
              <Link href="/#empresa" className="transition hover:text-black">
                Empresa
              </Link>
              <Link href="/catalogo" className="transition hover:text-black">
                Catálogo
              </Link>
              <Link href="/#proyectos" className="transition hover:text-black">
                Proyectos
              </Link>
              <Link href="/#contacto" className="transition hover:text-black">
                Contacto
              </Link>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">Sucursales</p>
            <div className="mt-4 grid gap-4 text-sm leading-6 text-neutral-600">
              <p>
                <span className="font-semibold text-black">Guatemala</span>
                <br />
                21 Avenida 0-18, Vista Hermosa 2, Zona 15.
              </p>
              <p>
                <span className="font-semibold text-black">Quetzaltenango</span>
                <br />
                Atención para hogares, comercios y proyectos en Xela.
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">Contacto</p>
            <div className="mt-4 grid gap-3 text-sm text-neutral-600">
              <a href="mailto:ventas@econoluz.net" className="transition hover:text-black">
                ventas@econoluz.net
              </a>
              <a href="tel:+50223111846" className="transition hover:text-black">
                2311 1846 / 2311 1847
              </a>
              <a
                href="https://wa.me/50240428790?text=Hola%2C%20quiero%20cotizar%20un%20proyecto%20de%20iluminaci%C3%B3n."
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-black"
              >
                WhatsApp 4042 8790
              </a>
              <p>Lunes a viernes, 8:00 AM - 5:00 PM</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-neutral-200 pt-6 text-sm text-neutral-500 lg:flex-row lg:items-center lg:justify-between">
          <p>&copy; 2026 ECONOLUZ GT. Todos los derechos reservados.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/politica-devoluciones" className="transition hover:text-black">
              Política de devoluciones y reembolsos
            </Link>
            <span>Precios sujetos a disponibilidad y especificación.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
