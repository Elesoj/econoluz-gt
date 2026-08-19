import CatalogClient from "./CatalogClient";
import { getPublicCatalog } from "../data/catalog.server";

export default function Catalogo() {
  return <CatalogClient products={getPublicCatalog()} />;
}
