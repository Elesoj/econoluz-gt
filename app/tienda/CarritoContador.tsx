"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useCarrito from "./useCarrito";

/**
 * El acceso al carrito, flotando sobre la página.
 *
 * Va abajo a la derecha, la esquina del pulgar, y no en la barra de
 * navegación: el dueño lo pidió así y además allí competía por sitio con el
 * logo y el menú. El botón de WhatsApp ocupa la esquina contraria.
 *
 * Solo aparece cuando hay algo dentro: un carrito vacío colgado en todas las
 * páginas es ruido, y en un sitio donde la mayoría del catálogo todavía no
 * tiene precio, sería ruido casi siempre. Tampoco aparece dentro del propio
 * carrito, donde no llevaría a ninguna parte, ni en el panel, que es la
 * trastienda y no la tienda.
 */
export default function CarritoContador() {
  const { articulos } = useCarrito();
  const pathname = usePathname();

  if (
    articulos === 0 ||
    pathname === "/carrito" ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <Link
      href="/carrito"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-tienda px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-tienda-fuerte sm:bottom-8 sm:right-8"
      aria-label={`Ver el carrito, ${articulos} ${articulos === 1 ? "artículo" : "artículos"}`}
    >
      <span aria-hidden="true">Carrito</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-black">
        {articulos}
      </span>
    </Link>
  );
}
