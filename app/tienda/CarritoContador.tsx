"use client";

import Link from "next/link";
import useCarrito from "./useCarrito";

/**
 * El acceso al carrito desde la barra de navegación.
 *
 * Solo aparece cuando hay algo dentro: un icono de carrito vacío colgado en
 * todas las páginas es ruido, y en un sitio donde la mayoría del catálogo
 * todavía no tiene precio, sería ruido casi siempre.
 */
export default function CarritoContador() {
  const { articulos } = useCarrito();

  if (articulos === 0) {
    return null;
  }

  return (
    <Link
      href="/carrito"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-proyectos transition hover:border-proyectos hover:bg-neutral-50"
      aria-label={`Ver el carrito, ${articulos} ${articulos === 1 ? "artículo" : "artículos"}`}
    >
      <span aria-hidden="true">Carrito</span>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-tienda px-1.5 text-xs tabular-nums text-white">
        {articulos}
      </span>
    </Link>
  );
}
