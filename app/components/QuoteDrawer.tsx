type QuoteDrawerProduct = {
  id: string;
  name: string;
  price: number;
};

type QuoteDrawerItem = {
  product: QuoteDrawerProduct;
  quantity: number;
};

type QuoteDrawerProps = {
  isOpen: boolean;
  items: QuoteDrawerItem[];
  total: number;
  formatPrice: (price: number) => string;
  onClose: () => void;
  onRemove: (productId: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
};

export default function QuoteDrawer({
  isOpen,
  items,
  total,
  formatPrice,
  onClose,
  onRemove,
  onUpdateQuantity,
}: QuoteDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar proyecto"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white text-black shadow-2xl">
        <div className="flex items-start justify-between border-b border-neutral-200 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
              Proyecto
            </p>
            <h2 className="mt-2 text-3xl font-semibold">Referencias seleccionadas</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Revisa cantidades antes de completar el formulario de asesoría.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-xl leading-none transition hover:border-black"
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="flex min-h-72 items-center justify-center border border-dashed border-neutral-300 p-8 text-center">
              <div>
                <p className="text-lg font-semibold">Tu proyecto aún está vacío.</p>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-neutral-500">
                  Agrega luminarias desde el catálogo para preparar una solicitud más precisa.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {items.map((item) => (
                <div key={item.product.id} className="border border-neutral-200 p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.product.name}</h3>
                      <p className="mt-1 text-sm text-neutral-500">
                        {item.product.price > 0 ? `${formatPrice(item.product.price)} ref.` : "Por cotizar"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item.product.id)}
                      className="text-sm font-semibold text-neutral-500 transition hover:text-black"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-full border border-neutral-200">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="h-9 w-9 text-lg transition hover:bg-neutral-100"
                      >
                        -
                      </button>
                      <span className="w-10 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="h-9 w-9 text-lg transition hover:bg-neutral-100"
                      >
                        +
                      </button>
                    </div>
                    <p className="font-semibold">
                      {item.product.price > 0
                        ? formatPrice(item.product.price * item.quantity)
                        : "Por cotizar"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
              Total estimado
            </p>
            <p className="text-2xl font-semibold">
              {total > 0 ? formatPrice(total) : "Por cotizar"}
            </p>
          </div>
          <a
            href="#asesoria-proyecto"
            onClick={onClose}
            className="mt-5 flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Completar asesoría
          </a>
          <p className="mt-4 text-xs leading-5 text-neutral-500">
            Lista temporal en el navegador. No se guarda información ni se procesa ningún pago.
          </p>
        </div>
      </aside>
    </div>
  );
}
