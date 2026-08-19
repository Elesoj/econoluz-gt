import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createCatalogImageRewrites,
  validateCatalogImageRewrites,
} from "./app/data/catalogImageRouting";
import { products } from "./app/data/products";

const catalogImageRewrites = createCatalogImageRewrites(products);

validateCatalogImageRewrites(catalogImageRewrites, (destination) =>
  existsSync(join(process.cwd(), "public", destination)),
);

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: catalogImageRewrites,
      fallback: [],
    };
  },
};

export default nextConfig;
