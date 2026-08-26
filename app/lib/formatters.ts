export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    maximumFractionDigits: 0,
  }).format(value);

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("es-GT", {
    maximumFractionDigits: 1,
  }).format(value);

/**
 * Precio de producto en quetzales, con los dos decimales que pide la
 * convención del proyecto. `formatCurrency` redondea a entero y sirve para
 * los ahorros estimados de la calculadora, donde los centavos sobran; en un
 * precio de venta, no.
 */
export const formatPrice = (value: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    // `Intl` separa el símbolo con un espacio duro (`Q 1,250.00`). La
    // convención del proyecto es `Q1,250.00` (CLAUDE.md §5).
    .replace(/ /g, "");
