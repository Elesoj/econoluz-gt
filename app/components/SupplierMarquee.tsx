import Image from "next/image";
import { suppliers } from "../data/siteData";

// La cinta necesita dos copias seguidas de la lista para que el bucle no dé
// tirón: la animación desplaza la mitad del ancho y aterriza sobre un logo
// idéntico al de partida. La segunda copia es puramente visual, así que va
// oculta para lectores de pantalla y no se anuncian once marcas dos veces.
const marqueeCopies = [
  { key: "original", isDecorative: false },
  { key: "duplicada", isDecorative: true },
];

export default function SupplierMarquee() {
  return (
    <section className="bg-white px-5 pt-12 sm:px-8 lg:pt-16">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tienda">
          Marcas y proveedores
        </p>

        <div className="supplier-marquee mt-8">
          <div className="supplier-marquee-track flex">
            {marqueeCopies.map((copy) => (
              <div
                key={copy.key}
                className="flex shrink-0 items-center"
                aria-hidden={copy.isDecorative || undefined}
              >
                {suppliers.map((supplier) => (
                  <div
                    key={`${copy.key}-${supplier.name}`}
                    className="flex w-44 shrink-0 items-center justify-center px-6 sm:w-56 sm:px-8"
                  >
                    <Image
                      src={supplier.logo}
                      alt={copy.isDecorative ? "" : supplier.name}
                      width={224}
                      height={80}
                      // Sin carga diferida: la cinta se mueve con una animación
                      // CSS y el navegador no considera que un logo haya
                      // entrado en pantalla, así que se quedaban en blanco al
                      // aparecer. Son once PNG de pocos kilobytes.
                      loading="eager"
                      className="h-10 w-auto object-contain sm:h-12"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
