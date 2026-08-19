import type { PublicProduct } from "../data/publicProduct";

type PublicQuoteLineInput = {
  product: Pick<PublicProduct, "publicName" | "econoluzReference">;
  quantity: number;
};

export const buildPublicProductLine = ({
  product,
  quantity,
}: PublicQuoteLineInput) =>
  `${product.publicName} - Ref. ${product.econoluzReference} - Cantidad: ${quantity}`;
