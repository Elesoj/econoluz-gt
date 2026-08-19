import "server-only";

import { products } from "./products";
import { toPublicProduct, type PublicProduct } from "./publicProduct";

export const getPublicCatalog = (): PublicProduct[] =>
  products.map((product) => toPublicProduct(product));
