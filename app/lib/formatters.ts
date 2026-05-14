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
