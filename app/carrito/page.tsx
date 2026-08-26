import type { Metadata } from "next";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import { getPublicCatalog } from "../data/catalog.server";
import { mainNavItems } from "../data/siteData";
import CarritoCliente from "./CarritoCliente";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Los productos que has seleccionado para comprar en ECONOLUZ.",
};

/**
 * El carrito vive en el navegador de cada visitante, pero los precios no: se
 * cargan aquí, en el servidor, y se emparejan con las referencias guardadas.
 * Así el importe que se ve es siempre el vigente, y no el que se guardó el día
 * que el visitante metió el producto.
 */
export default async function Carrito() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={mainNavItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Solicitar asesoría"
      />

      <CarritoCliente productos={await getPublicCatalog()} />

      <SiteFooter />
    </main>
  );
}
