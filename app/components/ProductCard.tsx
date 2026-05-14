import Image from "next/image";

type ProductCardProps = {
  product: {
    id: string;
    name: string;
    category: string;
    description: string;
    price: number;
    image: string;
  };
  quantity?: number;
  formatPrice: (price: number) => string;
  onAdd: () => void;
};

export default function ProductCard({
  product,
  quantity = 0,
  formatPrice,
  onAdd,
}: ProductCardProps) {
  return (
    <article className="group flex min-h-full flex-col overflow-hidden border border-neutral-200 bg-white transition duration-500 hover:-translate-y-1 hover:border-black hover:shadow-[0_24px_70px_rgba(0,0,0,0.12)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
          {product.category}
        </p>
        <h3 className="mt-3 text-2xl font-semibold leading-tight">{product.name}</h3>
        <p className="mt-4 flex-1 leading-7 text-neutral-600">{product.description}</p>

        <div className="mt-7 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Precio ref.</p>
            <p className="mt-1 text-xl font-semibold">{formatPrice(product.price)}</p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            {quantity > 0 ? `Agregado (${quantity})` : "Agregar a cotización"}
          </button>
        </div>
      </div>
    </article>
  );
}
