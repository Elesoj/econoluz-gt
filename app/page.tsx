import Image from "next/image";
import Link from "next/link";
import SiteFooter from "./components/SiteFooter";
import AnimatedStat from "./components/AnimatedStat";
import ProjectSlider from "./components/ProjectSlider";
import SectionHeader from "./components/SectionHeader";
import SiteNavbar from "./components/SiteNavbar";
import { projects } from "./data/projects";
import {
  collections,
  companyHighlights,
  companyStats,
  contact,
  faqs,
  homeNavItems,
} from "./data/siteData";

export default function Home() {
  return (
    <main className="w-full max-w-full overflow-x-hidden bg-white text-black">
      <SiteNavbar
        items={homeNavItems}
        ctaHref="/catalogo#asesoria-proyecto"
        ctaLabel="Cotizar"
        mobileCtaLabel="Cotizar proyecto"
      />

      <section
        id="inicio"
        className="relative isolate flex min-h-[100svh] w-full max-w-full scroll-mt-20 items-end overflow-hidden bg-black px-5 pb-12 pt-28 text-white sm:px-8 sm:pb-14 lg:pb-16"
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

        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="min-w-0 max-w-4xl">
            <p className="mb-5 max-w-full text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.22em] text-white/62 [overflow-wrap:anywhere] sm:text-xs sm:tracking-[0.34em]">
              Iluminación arquitectónica premium
            </p>
            <h1 className="max-w-full text-[2.12rem] font-semibold leading-[1.05] tracking-normal text-white [overflow-wrap:anywhere] sm:max-w-5xl sm:text-7xl sm:leading-[0.96] lg:text-8xl">
              Luz precisa para espacios que se sienten extraordinarios.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-white/72 sm:text-xl sm:leading-8">
              ECONOLUZ GT acompaña proyectos residenciales, comerciales y de
              hospitalidad con luminarias LED, asesoría técnica y piezas seleccionadas
              para arquitectura contemporánea.
            </p>
            <div className="mt-9 flex w-full max-w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/catalogo#asesoria-proyecto"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-200 sm:w-auto"
              >
                Agendar asesoría
              </Link>
              <Link
                href="/catalogo"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/22 px-7 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:border-white hover:bg-white/10 sm:w-auto"
              >
                Ver catálogo
              </Link>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-4 border-t border-white/16 pt-6 text-white/78 sm:gap-8 lg:min-w-[20rem] lg:border-l lg:border-t-0 lg:gap-10 lg:pl-8 lg:pt-0">
            {[
              ["2006", "Trayectoria"],
              ["LED", "Tecnología eficiente"],
            ].map(([value, label]) => (
              <div key={label} className="min-w-0">
                <p className="text-xl font-semibold text-white sm:text-2xl lg:text-3xl">{value}</p>
                <p className="mt-2 max-w-full text-[0.58rem] uppercase leading-4 tracking-[0.13em] [overflow-wrap:anywhere] sm:text-xs sm:tracking-[0.2em]">
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
              <AnimatedStat key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </div>
        </div>
      </section>

      <section
        id="empresa"
        className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20 lg:py-24"
      >
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Empresa
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              Iluminación con criterio técnico y sensibilidad arquitectónica.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              Desde Guatemala, ECONOLUZ GT ayuda a elegir la luz correcta para cada
              ambiente: eficiente, precisa y alineada con la intención del proyecto.
            </p>
          </div>

          <div className="grid min-w-0 gap-5 md:grid-cols-3">
            {companyHighlights.map((highlight) => (
              <article
                key={highlight.title}
                className="border border-neutral-200 p-6 transition duration-300 hover:-translate-y-1 hover:border-black"
              >
                <span className="block h-2 w-2 rounded-full bg-black" />
                <h3 className="mt-8 text-xl font-semibold">{highlight.title}</h3>
                <p className="mt-4 leading-7 text-neutral-600">{highlight.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-20 lg:pb-24">
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-6 border border-neutral-200 bg-white p-6 transition duration-300 hover:border-black sm:p-8 lg:grid-cols-[0.9fr_1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Calculadora LED
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Calcula antes de especificar.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-neutral-600">
            Estima consumo, ahorro mensual y reducción energética para llegar a la
            cotización con mejores datos.
          </p>
          <Link
            href="/calculadora-led"
            className="inline-flex w-fit rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
          >
            Usar calculadora
          </Link>
        </div>
      </section>

      <section
        id="colecciones"
        className="scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-20 lg:pb-24"
      >
        <div className="mx-auto w-full max-w-7xl min-w-0">
          <SectionHeader
            eyebrow="Explorar"
            title="Colecciones para especificación profesional."
            description="Una selección breve para orientar materiales, recorridos y atmósferas sin competir con la arquitectura."
            action={
              <Link
                href="/catalogo"
                className="inline-flex w-fit rounded-full border border-black px-6 py-3 text-sm font-semibold transition duration-300 hover:-translate-y-0.5 hover:bg-black hover:text-white"
              >
                Ver catálogo
              </Link>
            }
          />

          <div className="mt-12 grid min-w-0 gap-5 md:grid-cols-3">
            {collections.map((category) => (
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
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="proyectos"
        className="scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-20 lg:pb-24"
      >
        <div className="mx-auto w-full max-w-7xl min-w-0">
          <SectionHeader
            eyebrow="Proyectos"
            title="Aplicaciones reales de luz arquitectónica."
            description="Showrooms, edificios, restaurantes, residencias y luz lineal integrada a obra."
          />

          <ProjectSlider projects={projects} />
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-20 lg:pb-24">
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <SectionHeader eyebrow="Antes de cotizar" title="Preguntas rápidas." />

          <div className="grid gap-4">
            {faqs.map((item) => (
              <article
                key={item.question}
                className="border border-neutral-200 p-6 transition duration-300 hover:border-black"
              >
                <h3 className="text-xl font-semibold leading-tight">{item.question}</h3>
                <p className="mt-4 leading-7 text-neutral-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="contacto"
        className="scroll-mt-20 bg-black px-5 py-20 text-white sm:px-8 sm:py-24 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/48">
              Cotizar
            </p>
            <h2 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-7xl sm:leading-none">
              Especifiquemos la luz correcta desde el inicio.
            </h2>
          </div>
          <div>
            <p className="text-base leading-7 text-white/66 sm:text-lg sm:leading-8">
              Agenda una asesoría para revisar ambientes, acabados y requerimientos
              técnicos. También atendemos proyectos y clientes en Quetzaltenango.
            </p>
            <div className="mt-8 grid gap-3">
              <Link
                href="/catalogo#asesoria-proyecto"
                className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-200"
              >
                Preparar cotización
              </Link>
              <a
                href={`mailto:${contact.email}?subject=Solicitud%20de%20asesoria%20ECONOLUZ%20GT`}
                className="inline-flex items-center justify-center rounded-full border border-white/22 px-7 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:border-white hover:bg-white/10"
              >
                {contact.email}
              </a>
            </div>
            <div className="mt-8 grid gap-4 border-t border-white/12 pt-6 text-sm leading-6 text-white/58 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-white">Guatemala:</span>{" "}
                {contact.address}
              </p>
              <p>
                <span className="font-semibold text-white">Xela:</span> asesoría y
                venta de luminarias LED para hogares, comercios y proyectos.
              </p>
              <p>{contact.hours}.</p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
