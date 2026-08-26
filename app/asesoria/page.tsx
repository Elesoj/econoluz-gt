import type { Metadata } from "next";
import ProjectAdvisory from "../catalogo/ProjectAdvisory";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import { getPublicCatalog } from "../data/catalog.server";
import { mainNavItems } from "../data/siteData";

export const metadata: Metadata = {
  title: "Asesoría de proyecto",
  description:
    "Solicita asesoría técnica de iluminación para tu proyecto en Guatemala: luminarias, cantidades, presupuesto y especificación.",
};

/**
 * El formulario de asesoría, que antes ocupaba media página del catálogo.
 *
 * Carga el catálogo entero porque la selección de luminarias se guarda como
 * referencias y cantidades: para enseñarla hay que volver a emparejarla con
 * los productos.
 */
export default async function Asesoria() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={mainNavItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Solicitar asesoría"
      />

      <ProjectAdvisory products={await getPublicCatalog()} />

      <SiteFooter />
    </main>
  );
}
