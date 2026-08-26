import Image from "next/image";
import type { PublicProduct } from "../data/publicProduct";
import { formatPrice } from "../lib/formatters";

type ProductCardProps = {
  product: PublicProduct;
  /** Unidades en la selección de cotización. */
  quantity?: number;
  /** Unidades en el carrito de compra. */
  cartQuantity?: number;
  onAdd: () => void;
  onDecrease: () => void;
  onAddToCart: () => void;
  onDecreaseFromCart: () => void;
  onViewDetails: () => void;
};

export default function ProductCard({
  product,
  quantity = 0,
  cartQuantity = 0,
  onAdd,
  onDecrease,
  onAddToCart,
  onDecreaseFromCart,
  onViewDetails,
}: ProductCardProps) {
  const shortSpec =
    product.technicalSpecs?.power ??
    product.technicalSpecs?.luminousFlux ??
    product.technicalSpecs?.applicationType ??
    product.labels.productType;

  return (
    <article className="group flex min-h-full flex-col overflow-hidden border border-neutral-200 bg-white transition duration-300 hover:border-proyectos hover:shadow-[0_18px_44px_rgba(0,0,0,0.10)]">
      <button
        type="button"
        onClick={onViewDetails}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        className="relative aspect-square select-none overflow-hidden bg-white p-3 text-left sm:p-4"
        aria-label={`Ver ficha técnica de ${product.publicName}`}
      >
        <Image
          src={product.image}
          alt={product.publicName}
          fill
          draggable={false}
          sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          className="pointer-events-none select-none object-contain p-3 transition duration-500 group-hover:scale-105 sm:p-4"
        />
      </button>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tienda">
          {product.labels.productType}
        </p>
        <button type="button" onClick={onViewDetails} className="mt-2 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base">
            {product.publicName}
          </h3>
        </button>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Ref. {product.econoluzReference}
        </p>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-neutral-500">
          {[shortSpec, product.labels.finish].filter(Boolean).join(" / ")}
        </p>

        {/* El precio es lo primero que busca quien compra una o dos piezas.
            Mientras no lo tenga puesto, se dice que hay que consultarlo, en vez
            de dejar un hueco que parezca un fallo. */}
        {typeof product.priceGtq === "number" ? (
          <p className="mt-3 text-lg font-semibold tabular-nums text-proyectos">
            {formatPrice(product.priceGtq)}
          </p>
        ) : (
          <p className="mt-3 text-sm font-semibold text-neutral-500">Precio a consultar</p>
        )}

        <div className="mt-auto grid gap-2 pt-4">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 w-full items-center justify-center rounded-full border border-neutral-200 px-3 text-xs font-semibold text-black transition hover:border-proyectos hover:bg-neutral-50"
          >
            Ficha técnica
          </button>
          {/* Tener precio es estar a la venta: ese producto se compra. El que
              no lo tiene sigue el camino de siempre, el de la cotización. Los
              dos botones a la vez obligarían al visitante a elegir sin saber
              en qué se diferencian. */}
          {typeof product.priceGtq === "number" ? (
            cartQuantity > 0 ? (
              <div className="inline-flex h-9 w-full items-center justify-between rounded-full bg-tienda text-xs font-semibold text-white">
                <button
                  type="button"
                  onClick={onDecreaseFromCart}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Quitar una unidad de ${product.publicName} del carrito`}
                >
                  -
                </button>
                <span className="min-w-0 text-center">
                  En el carrito ({cartQuantity})
                </span>
                <button
                  type="button"
                  onClick={onAddToCart}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Agregar una unidad de ${product.publicName} al carrito`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAddToCart}
                className="inline-flex h-9 w-full items-center justify-center rounded-full bg-tienda px-3 text-xs font-semibold text-white transition hover:bg-tienda-fuerte"
              >
                Agregar al carrito
              </button>
            )
          ) : quantity > 0 ? (
            <div className="inline-flex h-9 w-full items-center justify-between rounded-full bg-proyectos text-xs font-semibold text-white">
              <button
                type="button"
                onClick={onDecrease}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Quitar una unidad de ${product.publicName}`}
              >
                -
              </button>
              <span className="min-w-0 text-center">Agregado ({quantity})</span>
              <button
                type="button"
                onClick={onAdd}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Agregar una unidad de ${product.publicName}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-9 w-full items-center justify-center rounded-full bg-proyectos px-3 text-xs font-semibold text-white transition hover:opacity-90"
            >
              Agregar a cotización
            </button>
          )}
        </div>
      </div>
    </article>
  );
}


