import Image from "next/image";

type ProductCardProps = {
  product: {
    id: string;
    name: string;
    brand?: string;
    category: string;
    subcategory?: string;
    collection?: string;
    finish?: string;
    application?: string;
    description: string;
    price: number;
    image: string;
    sku?: string;
    technicalSpecs?: {
      power?: string;
      luminousFlux?: string;
      voltage?: string;
      protection?: string;
      applicationType?: string;
    };
  };
  quantity?: number;
  formatPrice: (price: number) => string;
  onAdd: () => void;
  onDecrease: () => void;
  onViewDetails: () => void;
};

export default function ProductCard({
  product,
  quantity = 0,
  onAdd,
  onDecrease,
  onViewDetails,
}: ProductCardProps) {
  const shortSpec =
    product.technicalSpecs?.power ??
    product.technicalSpecs?.luminousFlux ??
    product.technicalSpecs?.applicationType ??
    product.subcategory ??
    product.category;

  return (
    <article className="group flex min-h-full flex-col overflow-hidden border border-neutral-200 bg-white transition duration-300 hover:border-black hover:shadow-[0_18px_44px_rgba(0,0,0,0.10)]">
      <button
        type="button"
        onClick={onViewDetails}
        className="relative aspect-square overflow-hidden bg-white p-3 text-left sm:p-4"
        aria-label={`Ver ficha técnica de ${product.name}`}
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          className="object-contain p-3 transition duration-500 group-hover:scale-105 sm:p-4"
        />
      </button>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {[product.brand, product.category].filter(Boolean).join(" / ")}
        </p>
        <button type="button" onClick={onViewDetails} className="mt-2 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base">
            {product.name}
          </h3>
        </button>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-neutral-500">
          {[shortSpec, product.finish].filter(Boolean).join(" / ")}
        </p>

        <div className="mt-auto grid gap-2 pt-4">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 w-full items-center justify-center rounded-full border border-neutral-200 px-3 text-xs font-semibold text-black transition hover:border-black hover:bg-neutral-50"
          >
            Ficha técnica
          </button>
          {quantity > 0 ? (
            <div className="inline-flex h-9 w-full items-center justify-between rounded-full bg-black text-xs font-semibold text-white">
              <button
                type="button"
                onClick={onDecrease}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Quitar una unidad de ${product.name}`}
              >
                -
              </button>
              <span className="min-w-0 text-center">Agregado ({quantity})</span>
              <button
                type="button"
                onClick={onAdd}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Agregar una unidad de ${product.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-9 w-full items-center justify-center rounded-full bg-black px-3 text-xs font-semibold text-white transition hover:bg-neutral-800"
            >
              Agregar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
