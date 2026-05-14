import Link from "next/link";
import ContactCTA from "../components/ContactCTA";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";

const navItems = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Empresa", href: "/#empresa" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Proyectos", href: "/#proyectos" },
  { label: "Contacto", href: "/#contacto" },
];

const policySections = [
  {
    title: "Resumen",
    content:
      "Nuestra política de devoluciones y reembolsos tiene una vigencia de 30 días. Si han pasado más de 30 días desde la fecha de compra, no podremos ofrecer un reembolso completo ni un cambio.",
  },
  {
    title: "Condiciones para devolución",
    content:
      "Para que un producto sea elegible para devolución, debe estar sin uso, en la misma condición en que fue recibido y dentro de su empaque original. Para completar la solicitud, se requiere recibo, factura o comprobante de compra.",
  },
  {
    title: "Productos no retornables",
    content:
      "No se aceptan devoluciones de productos instalados, modificados, dañados por uso incorrecto, incompletos o solicitados bajo especificaciones especiales. Tampoco se aceptan devoluciones de tarjetas de regalo, productos descargables, artículos en liquidación o productos que no estén en su condición original por causas ajenas a ECONOLUZ GT.",
  },
  {
    title: "Reembolsos parciales",
    content:
      "En ciertos casos solo se otorgarán reembolsos parciales, por ejemplo cuando el producto presente señales claras de uso, tenga piezas faltantes, esté dañado por causas no atribuibles a ECONOLUZ GT o sea devuelto después de 30 días de la entrega.",
  },
  {
    title: "Proceso de reembolso",
    content:
      "Una vez recibida e inspeccionada la devolución, notificaremos por correo electrónico si el reembolso fue aprobado o rechazado. Si se aprueba, el reembolso será procesado al método original de pago dentro de un plazo determinado según la entidad bancaria o procesador de pago.",
  },
  {
    title: "Reembolsos tardíos o faltantes",
    content:
      "Si aún no has recibido tu reembolso, revisa nuevamente tu cuenta bancaria. Luego contacta a tu compañía de tarjeta de crédito o banco, ya que puede existir un tiempo de procesamiento antes de que el reembolso se refleje oficialmente. Si después de estos pasos no lo has recibido, contáctanos en ventas@econoluz.net.",
  },
  {
    title: "Artículos en oferta",
    content:
      "Solo los artículos con precio regular pueden ser reembolsados. Los productos en oferta, promoción, descuento especial o liquidación no son reembolsables, salvo que exista un defecto confirmado según evaluación.",
  },
  {
    title: "Cambios",
    content:
      "Solo reemplazamos productos si están defectuosos o dañados. Si necesitas cambiarlo por el mismo artículo, escríbenos a ventas@econoluz.net y coordina el envío o entrega del producto a nuestra dirección: 21 Avenida 0-18, Vista Hermosa 2, Zona 15, Guatemala.",
  },
  {
    title: "Regalos",
    content:
      "Si el producto fue marcado como regalo al momento de la compra y enviado directamente al destinatario, se podrá emitir un crédito por el valor de la devolución. Si no fue marcado como regalo, el reembolso se gestionará con la persona que realizó la compra.",
  },
  {
    title: "Envío de devoluciones",
    content:
      "Para devolver un producto, coordina previamente con ECONOLUZ GT y envíalo o entrégalo en 21 Avenida 0-18, Vista Hermosa 2, Zona 15, Guatemala. El cliente será responsable de los costos de envío de la devolución. Los costos de envío no son reembolsables y, si aplica un reembolso, el costo del envío de retorno podrá deducirse del monto final.",
  },
  {
    title: "Ayuda",
    content:
      "Para preguntas relacionadas con reembolsos y devoluciones, contáctanos en ventas@econoluz.net o por WhatsApp al 4042 8790.",
  },
];

export default function PoliticaDevoluciones() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={navItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Contactar"
      />

      <section className="bg-black px-5 pb-16 pt-32 text-white sm:px-8 sm:pb-20 lg:pb-24 lg:pt-40">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/52">
            Política comercial
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-normal sm:text-7xl lg:text-8xl">
              Devoluciones y reembolsos.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/66 sm:text-xl sm:leading-8 lg:justify-self-end">
              Esta política aplica para compras realizadas en ECONOLUZ GT. La aprobación
              de cada solicitud depende del estado del producto, comprobante de compra,
              tiempo transcurrido y evaluación del equipo.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Información importante
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
              Antes de solicitar una revisión.
            </h2>
            <p className="mt-5 leading-7 text-neutral-600">
              Conserva factura, empaque, accesorios y cualquier documentación de compra.
              No envíes el producto directamente al fabricante; primero coordina la
              revisión con nuestro equipo.
            </p>
            <Link
              href="/#contacto"
              className="mt-8 inline-flex rounded-full bg-black px-7 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Consultar un caso
            </Link>
          </aside>

          <div className="grid gap-5">
            {policySections.map((section) => (
              <article key={section.title} className="border border-neutral-200 p-7">
                <h3 className="text-2xl font-semibold">{section.title}</h3>
                <p className="mt-4 leading-7 text-neutral-600">{section.content}</p>
              </article>
            ))}

            <div className="bg-neutral-950 p-7 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/46">
                Recomendación
              </p>
              <p className="mt-4 leading-7 text-white/70">
                Si devuelves productos de mayor valor, considera utilizar un servicio de
                envío rastreable o contratar seguro de transporte. ECONOLUZ GT no puede
                garantizar la recepción de productos enviados por terceros.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ContactCTA
        eyebrow="Ayuda"
        title="¿Tienes dudas sobre una devolución?"
        description="Comparte el comprobante de compra y el estado del producto para que el equipo pueda revisar tu caso."
        href="/#contacto"
        label="Contactar a ECONOLUZ"
      />

      <SiteFooter />
    </main>
  );
}
