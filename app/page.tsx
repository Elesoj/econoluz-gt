import Image from "next/image";
import SiteFooter from "./components/SiteFooter";
import ProjectSlider from "./components/ProjectSlider";
import SiteNavbar from "./components/SiteNavbar";

const navItems = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Empresa", href: "#empresa" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Proyectos", href: "#proyectos" },
  { label: "Contacto", href: "#contacto" },
];

const categories = [
  {
    title: "Decorativa",
    detail: "Colgantes, apliques y piezas de acento para ambientes memorables.",
    image:
      "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1100&q=85",
  },
  {
    title: "Arquitectónica",
    detail: "Perfiles lineales, luz indirecta y soluciones integradas a obra.",
    image:
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1100&q=85",
  },
  {
    title: "Técnica",
    detail: "Downlights, paneles y sistemas LED para precisión, eficiencia y confort.",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1100&q=85",
  },
];

const companyStats = [
  { value: "+500", label: "Lámparas" },
  { value: "11", label: "Marcas" },
  { value: "9", label: "Proveedores" },
  { value: "+1,000", label: "Clientes satisfechos" },
];

const projects = [
  {
    type: "Edificio",
    title: "Borghetto",
    description: "Proyecto arquitectónico con distintas escenas de iluminación interior y exterior.",
    images: [
      "/borghetto1.jpg",
      "/borghetto2.jpg",
      "/borghetto3.jpg",
      "/borghetto4.jpg",
      "/borghetto5.jpg",
      "/borghetto6.jpg",
    ],
  },
  {
    type: "Automotriz",
    title: "Agencia BMW",
    description: "Iluminación comercial para showroom automotriz y áreas de exhibición.",
    images: [
      "/bmw1.jpeg",
      "/bmw2.jpeg",
      "/bmw3.jpeg",
      "/bmw4.jpeg",
      "/bmw5.jpeg",
      "/bmw6.jpeg",
      "/bmw7.jpeg",
      "/bmw8.jpeg",
    ],
  },
  {
    type: "Edificio",
    title: "Torre Once",
    description: "Soluciones de luz para edificio vertical y espacios de circulación.",
    images: [
      "/once1.jpeg",
      "/once2.jpeg",
      "/once3.jpeg",
      "/once4.jpeg",
      "/once5.jpeg",
      "/once6.jpeg",
      "/once7.jpeg",
      "/once8.jpeg",
      "/once9.jpeg",
      "/once10.jpeg",
      "/once11.jpeg",
      "/once12.jpeg",
      "/once13.jpeg",
      "/once14.jpeg",
    ],
  },
  {
    type: "Restaurante",
    title: "San Martin",
    description: "Ambiente gastronómico con iluminación decorativa, funcional y de acento.",
    images: [
      "/sanmartin1.jpeg",
      "/sanmartin2.jpeg",
      "/sanmartin3.jpeg",
      "/sanmartin4.jpeg",
      "/sanmartin5.jpeg",
      "/sanmartin6.jpeg",
      "/sanmartin7.jpeg",
      "/sanmartin8.jpeg",
      "/sanmartin9.jpeg",
      "/sanmartin10.jpeg",
      "/sanmartin11.jpeg",
      "/sanmartin12.jpeg",
      "/sanmartin13.jpeg",
      "/sanmartin14.jpeg",
      "/sanmartin15.jpeg",
    ],
  },
  {
    type: "Edificio",
    title: "Insigne",
    description: "Iluminación para áreas comunes, interiores y arquitectura de edificio.",
    images: [
      "/insigne1.jpeg",
      "/insigne2.jpeg",
      "/insigne3.jpeg",
      "/insigne4.jpeg",
      "/insigne5.jpeg",
      "/insigne6.jpeg",
      "/insigne7.jpeg",
      "/insigne8.jpeg",
      "/insigne9.jpeg",
      "/insigne10.jpeg",
    ],
  },
  {
    type: "Residencial",
    title: "Casa Campo",
    description: "Proyecto residencial con luz cálida para fachada, recorrido y vida interior.",
    images: [
      "/campo1.jpeg",
      "/campo2.jpeg",
      "/campo3.jpeg",
      "/campo4.jpeg",
      "/campo5.jpeg",
      "/campo6.jpeg",
      "/campo7.jpeg",
      "/campo8.jpeg",
      "/campo9.jpeg",
      "/campo10.jpeg",
      "/campo11.jpeg",
      "/campo12.jpeg",
      "/campo13.jpeg",
    ],
  },
  {
    type: "Centro comercial",
    title: "La Estación",
    description: "Iluminación para espacios comerciales, circulaciones y experiencia pública.",
    images: [
      "/laestacion1.jpeg",
      "/laestacion2.jpeg",
      "/laestacion3.jpeg",
      "/laestacion4.jpeg",
      "/laestacion5.jpeg",
      "/laestacion6.jpeg",
      "/laestacion7.jpeg",
      "/laestacion8.jpeg",
      "/laestacion9.jpeg",
      "/laestacion10.jpeg",
    ],
  },
  {
    type: "Edificio",
    title: "Quo",
    description: "Aplicaciones arquitectónicas para edificio contemporáneo de uso mixto.",
    images: [
      "/quo1.jpeg",
      "/quo2.jpeg",
      "/quo3.jpeg",
      "/quo4.jpeg",
    ],
  },
  {
    type: "Edificio",
    title: "Veka",
    description: "Iluminación para fachada, interiores y ambientes de edificio moderno.",
    images: [
      "/veka1.jpeg",
      "/veka2.jpeg",
      "/veka3.jpeg",
      "/veka4.jpeg",
      "/veka5.jpeg",
      "/veka6.jpeg",
      "/veka7.jpeg",
      "/veka8.jpeg",
      "/veka9.jpeg",
      "/veka10.jpeg",
      "/veka11.jpeg",
      "/veka12.jpeg",
    ],
  },
  {
    type: "Retail",
    title: "Desigual",
    description: "Iluminación comercial para tienda, producto y experiencia de marca.",
    images: [
      "/desigual1.jpg",
      "/desigual2.jpg",
      "/desigual3.jpg",
      "/desigual4.jpg",
    ],
  },
  {
    type: "Automotriz",
    title: "Geely",
    description: "Iluminación para showroom automotriz con enfoque en exhibición y detalle.",
    images: [
      "/geely1.jpg",
      "/geely2.jpg",
      "/geely3.jpg",
    ],
  },
  {
    type: "Perfiles LED",
    title: "Perfiles LED",
    description: "Aplicaciones de luz lineal para arquitectura, cielos, muros y mobiliario.",
    images: [
      "/perfilesled1.jpg",
      "/perfilesled2.jpg",
      "/perfilesled3.jpg",
      "/perfilesled4.jpg",
      "/perfilesled5.jpg",
    ],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={navItems}
        ctaHref="/catalogo#asesoria-proyecto"
        ctaLabel="Cotizar"
        mobileCtaLabel="Cotizar proyecto"
      />

      <section
        id="inicio"
        className="relative isolate flex min-h-[100svh] scroll-mt-20 items-end overflow-hidden bg-black px-5 pb-12 pt-28 text-white sm:px-8 sm:pb-14 lg:pb-16"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=90"
            alt="Interior arquitectónico con iluminación premium"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-[0.62]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.58)_46%,rgba(0,0,0,0.18))]" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black to-transparent" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="max-w-4xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.34em] text-white/62">
              Iluminación arquitectónica premium
            </p>
            <h1 className="max-w-5xl text-5xl font-semibold leading-[0.96] tracking-normal text-white sm:text-7xl lg:text-8xl">
              Luz precisa para espacios que se sienten extraordinarios.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-white/72 sm:text-xl sm:leading-8">
              ECONOLUZ GT acompaña proyectos residenciales, comerciales y de
              hospitalidad con luminarias LED, asesorías técnicas y piezas de
              diseño seleccionadas para arquitectura contemporánea.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="/catalogo#asesoria-proyecto"
                className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
              >
                Agendar asesoría
              </a>
              <a
                href="/catalogo"
                className="inline-flex items-center justify-center rounded-full border border-white/22 px-7 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
              >
                Ver catálogo
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 border-t border-white/16 pt-6 text-white/78 lg:min-w-[20rem] lg:border-l lg:border-t-0 lg:gap-10 lg:pl-8 lg:pt-0">
            {[
              ["2006", "Trayectoria"],
              ["LED", "Tecnología eficiente"],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-xl font-semibold text-white sm:text-2xl lg:text-3xl">{value}</p>
                <p className="mt-2 text-[0.65rem] uppercase tracking-[0.2em] sm:text-xs">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 pt-8 sm:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl border border-neutral-200 bg-black text-white">
          <div className="grid divide-y divide-white/14 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {companyStats.map((stat) => (
              <div key={stat.label} className="px-6 py-7 text-center sm:px-8 lg:py-9">
                <p className="text-5xl font-semibold leading-none tracking-normal sm:text-6xl">
                  {stat.value}
                </p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/62">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="empresa" className="scroll-mt-20 px-5 pb-14 pt-14 sm:px-8 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Empresa
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              ¿Quiénes somos?
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600">
              Somos una empresa en Guatemala dedicada a la iluminación con lámparas
              LED para residencias, edificios, restaurantes, empresas y más. Nos
              caracterizamos por ir a la vanguardia de la tecnología, con diversidad
              de modelos en toda la línea LED. Ponemos a su disposición:
            </p>
            <div className="mt-8 grid gap-4 text-base font-semibold">
              {[
                "Lámparas industriales.",
                "Lámparas decorativas.",
                "Lámparas fluorescentes.",
                "Bombillería.",
              ].map((item) => (
                <div key={item} className="flex items-center gap-4">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-black text-xs">
                    ✓
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <article className="border border-neutral-200 p-7 transition duration-300 hover:border-black">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  Misión
                </p>
                <p className="mt-5 leading-7 text-neutral-600">
                  Ser la empresa líder que se encuentre a la vanguardia con la
                  tecnología para la iluminación y exteriores. Reconocida por la
                  calidad e innovación de los productos que distribuye para lograr el
                  mayor segmento del mercado a nivel nacional e internacional.
                </p>
              </article>

              <article className="border border-neutral-200 bg-black p-7 text-white transition duration-300 hover:bg-neutral-900">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/46">
                  Visión
                </p>
                <p className="mt-5 leading-7 text-white/70">
                  Somos una empresa que se dedica a la distribución y venta de
                  productos para la iluminación de interiores y exteriores. Contamos
                  con personal altamente capacitado el cual brinda asesoría y
                  seguimiento hasta satisfacer los gustos y necesidades de nuestros
                  clientes.
                </p>
              </article>
            </div>

            <div className="grid gap-5 border border-neutral-200 p-7 md:grid-cols-[0.85fr_1.15fr] md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  Quetzaltenango
                </p>
                <h3 className="mt-3 text-2xl font-semibold">ECONOLUZ en Xela.</h3>
              </div>
              <p className="leading-7 text-neutral-600">
                Atención para quienes buscan lámparas LED, iluminación decorativa,
                bombillería y soluciones para hogares, oficinas, comercios y proyectos
                en Quetzaltenango.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="colecciones" className="scroll-mt-20 px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-12 lg:pb-32 lg:pt-14">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
                Colecciones
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
                Productos seleccionados para especificación profesional.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8 md:justify-self-end">
              Menos ruido visual, más criterio: luminarias que elevan materiales,
              recorridos y atmósferas sin competir con la arquitectura.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3 lg:mt-14">
            {categories.map((category) => (
              <article key={category.title} className="group bg-neutral-950 text-white">
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={category.image}
                    alt={category.title}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover opacity-[0.88] transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                  />
                </div>
                <div className="p-6 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/42">
                    Colección
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold">{category.title}</h3>
                  <p className="mt-4 leading-7 text-white/62">{category.detail}</p>
                  <a
                    href="#contacto"
                    className="mt-8 inline-flex text-sm font-semibold text-white underline decoration-white/30 underline-offset-8 transition hover:decoration-white"
                  >
                    Solicitar opciones
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 px-5 py-20 text-white sm:px-8 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/46">
              Características
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Servicio, calidad y cobertura.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["Eficiencia", "Ofrecemos asesoría y excelente servicio post venta."],
              ["Calidad", "Somos distribuidores autorizados de las más prestigiosas marcas."],
              ["Distinción", "Ofrecemos atención a nivel nacional."],
            ].map(([title, text], index) => (
              <article
                key={title}
                className={`border border-white/12 p-7 text-center transition duration-300 hover:border-white/34 ${
                  index === 1 ? "bg-white text-black" : ""
                }`}
              >
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-2xl font-semibold ${
                    index === 1 ? "border-black text-black" : "border-white/28 text-white"
                  }`}
                >
                  {index + 1}
                </div>
                <h3 className="mt-7 text-2xl font-semibold">{title}</h3>
                <p className={`mt-5 leading-7 ${index === 1 ? "text-neutral-600" : "text-white/70"}`}>
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="proyectos" className="scroll-mt-20 px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-12 lg:pb-32 lg:pt-14">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
                Proyectos
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                Proyectos iluminados por ECONOLUZ.
              </h2>
            </div>
            <a
              href="/catalogo#asesoria-proyecto"
              className="inline-flex w-fit rounded-full border border-black px-6 py-3 text-sm font-semibold transition hover:bg-black hover:text-white"
            >
              Hablemos de tu proyecto
            </a>
          </div>

          <ProjectSlider projects={projects} />
        </div>
      </section>

      <section className="px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-12 lg:pb-32 lg:pt-14">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Preguntas frecuentes
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Información útil antes de cotizar.
            </h2>
          </div>

          <div className="grid gap-4">
            {[
              [
                "¿Dónde puedo comprar lámparas LED en Guatemala?",
                "En Econoluz GT, ofrecemos una amplia variedad de lámparas LED para residencias, edificios, restaurantes y empresas. Puedes explorar nuestro catálogo en línea o visitarnos en nuestra oficina.",
              ],
              [
                "¿Qué tipos de lámparas LED en Guatemala ofrecen?",
                "En Econoluz GT, contamos con una extensa línea de lámparas LED incluyendo focos, tubos, paneles, lámparas decorativas y soluciones de iluminación especializadas para diferentes necesidades.",
              ],
              [
                "¿Realizan envíos a toda Guatemala?",
                "Sí, en Econoluz GT realizamos envíos de nuestras lámparas LED a toda Guatemala. Consulta nuestras políticas de envío para más detalles.",
              ],
            ].map(([question, answer]) => (
              <article key={question} className="border border-neutral-200 p-6">
                <h3 className="text-xl font-semibold leading-tight">{question}</h3>
                <p className="mt-4 leading-7 text-neutral-600">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contacto" className="scroll-mt-20 bg-black px-5 py-20 text-white sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/48">
              Contacto
            </p>
            <h2 className="mt-4 max-w-4xl text-5xl font-semibold leading-none sm:text-7xl">
              Especifiquemos la luz correcta desde el inicio.
            </h2>
          </div>
          <div>
            <p className="text-base leading-7 text-white/66 sm:text-lg sm:leading-8">
              Visítanos en Vista Hermosa 2, Zona 15, o agenda una asesoría para
              revisar ambientes, acabados y requerimientos técnicos. También atendemos
              proyectos y clientes en Quetzaltenango.
            </p>
            <div className="mt-8 grid gap-3">
              <a
                href="mailto:ventas@econoluz.net?subject=Solicitud%20de%20asesoria%20ECONOLUZ%20GT"
                className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
              >
                ventas@econoluz.net
              </a>
              <a
                href="tel:+50223111846"
                className="inline-flex items-center justify-center rounded-full border border-white/22 px-7 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
              >
                2311 1846 / 2311 1847
              </a>
            </div>
            <div className="mt-8 grid gap-4 border-t border-white/12 pt-6 text-sm leading-6 text-white/58 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-white">Guatemala:</span> 21 Avenida
                0-18, Vista Hermosa 2, Zona 15.
              </p>
              <p>
                <span className="font-semibold text-white">Xela:</span> asesoría y
                venta de luminarias LED para hogares, comercios y proyectos.
              </p>
              <p>Horario: lunes a viernes, 8:00 AM - 5:00 PM.</p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
