import Image from "next/image";

const brands = [
  { name: "Construlita", src: "/proveedores/construlita.png" },
  { name: "Highlum", src: "/proveedores/highlum.png" },
  { name: "Ilum", src: "/proveedores/ilum.png" },
  { name: "Ilumitec", src: "/proveedores/ilumitec.png" },
  { name: "Lighttec", src: "/proveedores/lighttec.png" },
  { name: "OSRAM", src: "/proveedores/osram.png" },
  { name: "Philips", src: "/proveedores/philips.png" },
  { name: "Proelca", src: "/proveedores/proelca.png" },
  { name: "Sunnovation", src: "/proveedores/sunnovation.png" },
  { name: "Sylvania", src: "/proveedores/sylvania.png" },
  { name: "Tecnolite", src: "/proveedores/tecnolite.png" },
];

export default function BrandsCarousel() {
  return (
    <section className="w-full max-w-full overflow-hidden bg-white px-5 py-14 sm:px-8 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <div className="grid gap-6 border-y border-neutral-200 py-8 md:grid-cols-[0.72fr_1.28fr] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Proveedores
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Marcas con las que trabajamos
            </h2>
          </div>

          <div className="relative min-w-0 overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent" />

            <div className="max-w-full overflow-hidden" aria-label="Marcas proveedoras de ECONOLUZ GT">
              <div className="brands-marquee flex w-max touch-pan-y select-none gap-4">
                {[...brands, ...brands].map((brand, index) => (
                  <div
                    key={`${brand.name}-${index}`}
                    className="flex h-24 w-40 shrink-0 items-center justify-center border border-neutral-200 bg-white px-6 transition duration-300 hover:border-black sm:w-48"
                  >
                    <Image
                      src={brand.src}
                      alt={brand.name}
                      width={180}
                      height={72}
                      className="max-h-12 w-auto max-w-full object-contain transition duration-300 hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
