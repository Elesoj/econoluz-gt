"use client";

import Image from "next/image";
import type { Product } from "../data/products";
import { useEffect } from "react";

type TechnicalProduct = Product;

type SpecRow = [string, string | string[] | undefined];

type ProductTechnicalDrawerProps = {
  product: TechnicalProduct | null;
  quantity?: number;
  onAdd: (product: TechnicalProduct) => void;
  onDecrease: (product: TechnicalProduct) => void;
  onClose: () => void;
  onViewQuote: () => void;
};

export default function ProductTechnicalDrawer({
  product,
  quantity = 0,
  onAdd,
  onDecrease,
  onClose,
  onViewQuote,
}: ProductTechnicalDrawerProps) {
  useEffect(() => {
    if (!product) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, product]);

  if (!product) {
    return null;
  }

  const addProduct = () => {
    onAdd(product);
  };

  const specs = product.technicalSpecs;
  const productImages = product.images?.length ? product.images : [product.image];
  const baseSpecRows: SpecRow[] = [
    ["Voltaje", specs?.voltage],
    ["Amperaje", specs?.amperage],
    ["Frecuencia", specs?.frequency],
    ["Material", specs?.material],
    ["Dimensiones", specs?.dimensions],
    ["Presentación", specs?.presentation],
    ["Tamaño PCB", specs?.pcbSize],
    ["Acabado / color", specs?.finish ?? product.labels.finish],
    ["Salida USB", specs?.usbOutput],
    ["Soporte GFCI", specs?.gfciSupport],
    ["Fijación", specs?.fixing],
    ["Aplicación", specs?.applicationType ?? product.labels.application],
    ["Instalación", specs?.installation],
  ].filter((row): row is [string, string | string[]] => Boolean(row[1]));

  const extraSpecRows: SpecRow[] = [
    ["Protección", specs?.protection],
    ["Estándar", specs?.standard],
    ["Configuración", specs?.configuration],
    ["Tipo LED", specs?.ledType],
    ["Velocidad de desconexión", specs?.disconnectSpeed],
    ["Operaciones", specs?.operatingTemperature],
    ["Humedad", specs?.humidity],
    ["Voltaje dieléctrico", specs?.dielectricVoltage],
    ["SCCR", specs?.shortCircuitCurrent],
    ["Nivel de conmutación", specs?.switchingLevel],
    ["Flujo luminoso", specs?.luminousFlux],
    ["Potencia", specs?.power],
    ["Eficiencia", specs?.efficiency],
    ["Atenuación", specs?.dimming],
    ["TCC", specs?.colorTemperature],
    ["IRC", specs?.cri],
    ["Ángulo", specs?.beamAngle],
    ["IK", specs?.impactRating],
    ["Vida útil", specs?.lifetime],
    ["Ahorro", specs?.savings],
    ["Equivalente", specs?.equivalent],
    ["Certificados", specs?.certifications],
  ].filter((row): row is [string, string | string[]] => Boolean(row[1]));

  const specRows = [...baseSpecRows, ...extraSpecRows];
  const specialFeatures = Array.isArray(specs?.specialFeatures)
    ? specs.specialFeatures
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <button
        type="button"
        aria-label="Cerrar ficha técnica"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      <aside className="absolute inset-x-0 bottom-0 flex h-[92dvh] w-full max-w-full flex-col overflow-hidden bg-white text-black shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:max-w-2xl">
        <div className="z-10 flex shrink-0 items-start justify-between border-b border-neutral-200 bg-white p-5 sm:p-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
              Ficha técnica
            </p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
              {product.publicName}
            </h2>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Ref. {product.econoluzReference}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-xl leading-none transition hover:border-black"
            aria-label="Cerrar"
          >
            x
          </button>
        </div>

        <div className="product-drawer-scroll flex-1 overflow-y-auto overscroll-contain">
          <div className="grid shrink-0 gap-px bg-neutral-200 sm:grid-cols-2">
            {productImages.map((image, index) => (
              <div
                key={image}
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                className={`relative aspect-[16/10] select-none bg-white p-8 ${
                  productImages.length === 1 ? "sm:col-span-2" : ""
                }`}
              >
                <Image
                  src={image}
                  alt={`${product.publicName}${productImages.length > 1 ? ` ${index + 1}` : ""}`}
                  fill
                  draggable={false}
                  sizes="(min-width: 768px) 42rem, 100vw"
                  className="pointer-events-none select-none object-contain p-8"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-7 p-5 sm:p-7">
            <div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  {product.labels.productType}
                </p>
                {product.labels.finish && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {product.labels.finish && (
                      <span className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700">
                        {product.labels.finish}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-4 text-base leading-7 text-neutral-600">
                  {product.publicDescription}
                </p>
              </div>
            </div>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Información técnica
              </h3>
              <div className="mt-4 grid border border-neutral-200 sm:grid-cols-2">
                {specRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="border-b border-neutral-200 p-4 last:border-b-0 even:sm:border-l sm:last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      {label}
                    </p>
                    <p className="mt-2 font-semibold">
                      {Array.isArray(value) ? value.join(", ") : value}
                    </p>
                  </div>
                ))}
              </div>
              {specialFeatures.length > 0 && (
                <div className="mt-5 border border-neutral-200 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Características especiales
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {specialFeatures.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 bg-white p-5 sm:p-7">
          {quantity > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-black">
                  Producto agregado
                </p>
                <div className="inline-flex h-11 items-center rounded-full bg-black text-sm font-semibold text-white">
                  <button
                    type="button"
                    onClick={() => onDecrease(product)}
                    className="flex h-11 w-12 items-center justify-center rounded-full transition hover:bg-white/12"
                    aria-label={`Quitar una unidad de ${product.publicName}`}
                  >
                    -
                  </button>
                  <span className="min-w-12 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={addProduct}
                    className="flex h-11 w-12 items-center justify-center rounded-full transition hover:bg-white/12"
                    aria-label={`Agregar una unidad de ${product.publicName}`}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center rounded-full border border-black px-7 py-4 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-black hover:text-white"
                >
                  Seguir viendo productos
                </button>
                <button
                  type="button"
                  onClick={onViewQuote}
                  className="flex items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
                >
                  Ver cotización
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={addProduct}
              className="flex w-full items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
            >
              Agregar a cotización
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

