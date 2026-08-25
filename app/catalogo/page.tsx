import CatalogClient from "./CatalogClient";
import { getPublicCatalog } from "../data/catalog.server";

export default async function Catalogo() {
  return <CatalogClient products={await getPublicCatalog()} />;
}
