import ContactCTA from "../components/ContactCTA";
import LedSavingsCalculator from "../components/LedSavingsCalculator";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";

const navItems = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Empresa", href: "/#empresa" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Proyectos", href: "/#proyectos" },
  { label: "Contacto", href: "/#contacto" },
];

const benefits = [
  {
    title: "Ahorro energético",
    text: "La tecnología LED reduce el consumo frente a luminarias tradicionales, especialmente en espacios con muchas horas de uso.",
  },
  {
    title: "Mayor vida útil",
    text: "Una luminaria eficiente puede reducir la frecuencia de reemplazos y mantener una operación más estable.",
  },
  {
    title: "Menor mantenimiento",
    text: "En residencias, comercios y edificios, menos cambios de lámparas significa menos pausas y menos costos operativos.",
  },
  {
    title: "Mejor control visual",
    text: "El LED permite seleccionar temperaturas, ópticas y niveles de luz adecuados para cada ambiente.",
  },
];

export default function CalculadoraLed() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={navItems}
        ctaHref="/catalogo#asesoria-proyecto"
        ctaLabel="Cotizar"
        mobileCtaLabel="Cotizar proyecto"
      />

      <section className="bg-black px-5 pb-16 pt-32 text-white sm:px-8 sm:pb-20 lg:pb-24 lg:pt-40">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/52">
            Calculadora LED
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-normal sm:text-7xl lg:text-8xl">
              Calcula cuánto podrías ahorrar con iluminación LED.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/66 sm:text-xl sm:leading-8 lg:justify-self-end">
              Estima consumo, ahorro mensual y ahorro anual antes de definir una
              solución de iluminación para tu hogar, comercio, oficina o proyecto.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <LedSavingsCalculator />
        </div>
      </section>

      <section className="bg-neutral-950 px-5 py-16 text-white sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Comparación visual"
            title="Antes y después de migrar a LED."
            description="La diferencia no solo está en el consumo: también se nota en mantenimiento, confort visual y control de la atmósfera."
            invert
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="border border-white/12 p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                Antes LED
              </p>
              <h3 className="mt-4 text-3xl font-semibold">Mayor consumo y mantenimiento.</h3>
              <div className="mt-8 grid gap-3 text-white/66">
                <p>Consumo elevado por luminaria.</p>
                <p>Más reemplazos y más interrupciones.</p>
                <p>Menor control de temperatura y distribución.</p>
              </div>
            </article>

            <article className="bg-white p-7 text-black">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Después LED
              </p>
              <h3 className="mt-4 text-3xl font-semibold">Eficiencia con mejor intención visual.</h3>
              <div className="mt-8 grid gap-3 text-neutral-600">
                <p>Menor consumo mensual estimado.</p>
                <p>Vida útil más larga y menos mantenimiento.</p>
                <p>Opciones para residencias, comercios y proyectos.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Beneficios"
            title="Por qué la iluminación LED transforma el costo operativo."
            description="Una buena especificación combina eficiencia, calidad visual y una luminaria adecuada para cada uso."
          />

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <article
                key={benefit.title}
                className="border border-neutral-200 p-6 transition duration-300 hover:-translate-y-1 hover:border-black"
              >
                <span className="block h-2 w-2 rounded-full bg-black" />
                <h3 className="mt-8 text-xl font-semibold">{benefit.title}</h3>
                <p className="mt-4 leading-7 text-neutral-600">{benefit.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ContactCTA
        eyebrow="Siguiente paso"
        title="Solicitar asesoría con estos resultados"
        description="Usa el resultado como punto de partida y completa una solicitud de proyecto para revisar cantidades, temperaturas, ópticas y productos adecuados."
        href="/catalogo#asesoria-proyecto"
        label="Solicitar asesoría"
      />

      <SiteFooter />
    </main>
  );
}
