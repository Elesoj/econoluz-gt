"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type TechnicalProduct = {
  id: string;
  name: string;
  brand?: string;
  category: string;
  subcategory?: string;
  finish?: string;
  description: string;
  price: number;
  image: string;
  sku?: string;
  technicalSpecs?: {
    voltage?: string;
    amperage?: string;
    frequency?: string;
    material?: string;
    dimensions?: string;
    finish?: string;
    usbOutput?: string;
    gfciSupport?: string;
    applicationType?: string;
    protection?: string;
    standard?: string;
    disconnectSpeed?: string;
    operatingTemperature?: string;
    humidity?: string;
    dielectricVoltage?: string;
    shortCircuitCurrent?: string;
    switchingLevel?: string;
    specialFeatures?: string[];
  };
};

type ProductTechnicalDrawerProps = {
  product: TechnicalProduct | null;
  formatPrice: (price: number) => string;
  onAdd: (product: TechnicalProduct) => void;
  onClose: () => void;
  onViewQuote: () => void;
};

export default function ProductTechnicalDrawer({
  product,
  formatPrice,
  onAdd,
  onClose,
  onViewQuote,
}: ProductTechnicalDrawerProps) {
  const [isAdded, setIsAdded] = useState(false);

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
    setIsAdded(true);
  };

  const specs = product.technicalSpecs;
  const baseSpecRows = [
    ["Voltaje", specs?.voltage],
    ["Amperaje", specs?.amperage],
    ["Frecuencia", specs?.frequency],
    ["Material", specs?.material],
    ["Dimensiones", specs?.dimensions],
    ["Acabado / color", specs?.finish ?? product.finish],
    ["Salida USB", specs?.usbOutput],
    ["Soporte GFCI", specs?.gfciSupport],
    ["Aplicación", specs?.applicationType ?? product.subcategory],
  ].filter(([, value]) => Boolean(value));

  const extraSpecRows = [
    ["Protección", specs?.protection],
    ["Estándar", specs?.standard],
    ["Velocidad de desconexión", specs?.disconnectSpeed],
    ["Operaciones", specs?.operatingTemperature],
    ["Humedad", specs?.humidity],
    ["Voltaje dieléctrico", specs?.dielectricVoltage],
    ["SCCR", specs?.shortCircuitCurrent],
    ["Nivel de conmutación", specs?.switchingLevel],
  ].filter(([, value]) => Boolean(value));

  const specRows = [...baseSpecRows, ...extraSpecRows];

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
              {product.name}
            </h2>
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
          <div className="relative aspect-[16/10] shrink-0 bg-white p-8">
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(min-width: 768px) 42rem, 100vw"
              className="object-contain p-8"
            />
          </div>

          <div className="grid gap-7 p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  {[product.brand, product.category].filter(Boolean).join(" / ")}
                </p>
                {product.sku && (
                  <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Código {product.sku}
                  </p>
                )}
                {(product.subcategory || product.finish) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {product.subcategory && (
                      <span className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700">
                        {product.subcategory}
                      </span>
                    )}
                    {product.finish && (
                      <span className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700">
                        {product.finish}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-4 text-base leading-7 text-neutral-600">
                  {product.description}
                </p>
              </div>
              <div className="border border-neutral-200 p-4 sm:min-w-40">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Precio ref.
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {product.price > 0 ? formatPrice(product.price) : "Por cotizar"}
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
                    <p className="mt-2 font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              {specs?.specialFeatures && specs.specialFeatures.length > 0 && (
                <div className="mt-5 border border-neutral-200 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Características especiales
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {specs.specialFeatures.map((feature) => (
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
          {isAdded ? (
            <div>
              <p className="text-center text-sm font-semibold text-black">
                Producto agregado a cotización
              </p>
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
