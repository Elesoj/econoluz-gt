type CatalogImageProduct = {
  econoluzReference: string;
  image: string;
  images?: readonly string[];
};

export type CatalogImageRewrite = {
  source: string;
  destination: string;
};

const getImageExtension = (physicalPath: string) => {
  const extension = physicalPath.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();

  if (!extension) {
    throw new Error(`catalog image has no extension ${physicalPath}`);
  }

  return extension;
};

export const getNeutralCatalogImageUrl = (
  econoluzReference: string,
  ordinal: number,
  physicalPath: string,
) =>
  `/media/catalogo/${econoluzReference}/${ordinal}.${getImageExtension(physicalPath)}`;

export const createCatalogImageRewrites = (
  catalog: readonly CatalogImageProduct[],
): CatalogImageRewrite[] =>
  catalog.flatMap((product) => {
    const physicalImages = product.images?.length
      ? product.images
      : [product.image];

    return physicalImages.map((destination, index) => ({
      source: getNeutralCatalogImageUrl(
        product.econoluzReference,
        index + 1,
        destination,
      ),
      destination,
    }));
  });

export const validateCatalogImageRewrites = (
  rewrites: readonly CatalogImageRewrite[],
  assetExists: (destination: string) => boolean,
) => {
  const seenAliases = new Set<string>();

  for (const { source, destination } of rewrites) {
    if (seenAliases.has(source)) {
      throw new Error(`duplicate catalog image alias ${source}`);
    }

    seenAliases.add(source);

    if (!/^\/media\/catalogo\/ECO-[A-Z]+-\d{4}\/\d+\.[a-z0-9]+$/.test(source)) {
      throw new Error(`invalid catalog image alias ${source}`);
    }

    if (!destination.startsWith("/catalogos/") || destination.includes("*")) {
      throw new Error(`invalid catalog image destination ${destination}`);
    }

    if (!assetExists(destination)) {
      throw new Error(`missing catalog image destination ${destination}`);
    }
  }
};
