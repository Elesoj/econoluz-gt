import Image from "next/image";

type ProductCardProps = {
  product: {
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
  formatPrice,
  onAdd,
  onDecrease,
  onViewDetails,
}: ProductCardProps) {
  return (
    <article className="group flex min-h-full flex-col overflow-hidden border border-neutral-200 bg-white transition duration-500 hover:-translate-y-1 hover:border-black hover:shadow-[0_24px_70px_rgba(0,0,0,0.12)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-white p-6">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-6 transition duration-700 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
          {[product.brand, product.subcategory ?? product.category].filter(Boolean).join(" / ")}
        </p>
        <h3 className="mt-3 text-2xl font-semibold leading-tight">{product.name}</h3>
        {product.sku && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Código {product.sku}
          </p>
        )}
        {product.finish && (
          <p className="mt-2 text-sm font-medium text-neutral-500">{product.finish}</p>
        )}
        <p className="mt-4 flex-1 leading-7 text-neutral-600">{product.description}</p>

        <div className="mt-7 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Precio ref.</p>
            <p className="mt-1 text-xl font-semibold">
              {product.price > 0 ? formatPrice(product.price) : "Por cotizar"}
            </p>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={onViewDetails}
              className="inline-flex justify-center rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-black transition hover:border-black hover:bg-neutral-50"
            >
              Ver ficha técnica
            </button>
            {quantity > 0 ? (
              <div className="inline-flex items-center justify-between rounded-full bg-black text-sm font-semibold text-white">
                <button
                  type="button"
                  onClick={onDecrease}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Quitar una unidad de ${product.name}`}
                >
                  -
                </button>
                <span className="min-w-28 text-center">Agregado ({quantity})</span>
                <button
                  type="button"
                  onClick={onAdd}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Agregar una unidad de ${product.name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Agregar a cotización
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
