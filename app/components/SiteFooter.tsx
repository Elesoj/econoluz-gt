"use client";

import Image from "next/image";
import Link from "next/link";
import { type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { contact, mainNavItems } from "../data/siteData";

export default function SiteFooter() {
  const pathname = usePathname();

  const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("/#") || pathname !== "/") {
      return;
    }

    event.preventDefault();
    const target = document.querySelector<HTMLElement>(href.replace("/", ""));

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", href);
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.replaceState(null, "", href);
  };

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
              {mainNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => handleNavClick(event, item.href)}
                  className="transition hover:text-black"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">Sucursales</p>
            <div className="mt-4 grid gap-4 text-sm leading-6 text-neutral-600">
              <p>
                <span className="font-semibold text-black">Guatemala</span>
                <br />
                {contact.address}
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
              <a href={`mailto:${contact.email}`} className="transition hover:text-black">
                {contact.email}
              </a>
              <a href={contact.phoneHref} className="transition hover:text-black">
                {contact.phoneLabel}
              </a>
              <a
                href={`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(contact.whatsappDefaultMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-black"
              >
                {contact.whatsappLabel}
              </a>
              <p>{contact.hours}</p>
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
