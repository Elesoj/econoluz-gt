export const brands = {
  artlite: { id: "artlite", label: "Artlite" },
  construlita: { id: "construlita", label: "Construlita" },
  highlum: { id: "highlum", label: "Highlum" },
} as const;

export type BrandId = keyof typeof brands;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const brandByLabel = Object.fromEntries(
  Object.entries(brands).map(([id, item]) => [item.label.toLowerCase(), id]),
) as Record<string, BrandId>;

export const getBrandId = (label = "") =>
  brandByLabel[label.toLowerCase()] ?? slugify(label);

export const getBrandLabel = (id: string) =>
  brands[id as BrandId]?.label ?? id;
