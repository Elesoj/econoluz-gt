"use client";

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PublicProduct } from "../data/publicProduct";
import {
  contact,
  quoteBudgetRanges,
  quoteLightingTypes,
  quoteProjectTypes,
} from "../data/siteData";
import { buildPublicProductLine } from "./publicQuoteMessage";
import useQuoteSelection from "./useQuoteSelection";

type QuoteFormState = {
  fullName: string;
  phone: string;
  email: string;
  projectType: string;
  estimatedArea: string;
  budgetRange: string;
  lightingType: string;
  message: string;
};

type QuoteFormErrors = Partial<Record<keyof QuoteFormState, string>>;

type StoredLedResults = {
  summary?: string;
};

const initialFormState: QuoteFormState = {
  fullName: "",
  phone: "",
  email: "",
  projectType: "",
  estimatedArea: "",
  budgetRange: "",
  lightingType: "",
  message: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Orden de tabulación de los campos obligatorios, para saber a cuál llevar el
// foco cuando la validación falla.
const requiredQuoteFields = ["fullName", "phone", "email"] as const;

type RequiredQuoteField = (typeof requiredQuoteFields)[number];

const quoteFieldLabels: Record<RequiredQuoteField, string> = {
  fullName: "Nombre completo",
  phone: "Teléfono",
  email: "Email",
};

// Los navegadores in-app de Facebook e Instagram suelen ignorar target="_blank"
// y, con él, el salto a la app de WhatsApp. Ahí conviene navegar en la misma
// pestaña, que sí consigue abrirla. Detectar por user agent es imperfecto, pero
// no hay otra señal disponible; y como el lead ya se guardó antes del salto,
// equivocarse solo cuesta la pestaña del formulario, no la solicitud.
const isMetaInAppBrowser = () =>
  typeof navigator !== "undefined" &&
  /FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent);

// El user agent no cambia durante la vida de la página, así que no hay nada a
// lo que suscribirse. Se lee con useSyncExternalStore para que el servidor
// renderice siempre `false` y el cliente corrija tras hidratar, sin desajuste.
const subscribeToUserAgent = () => () => {};

// Envía el lead sin bloquear la navegación del enlace a WhatsApp.
//
// Nunca se espera esta promesa antes de dejar que el enlace navegue: hacerlo
// consumiría la activación de usuario y el navegador bloquearía el salto.
// `keepalive` mantiene viva la petición aunque la página se descargue.
// Cuando la navegación ocurre en la misma pestaña, `sendBeacon` da una garantía
// de entrega mejor, a costa de no poder leer la respuesta.
const postLead = (
  payload: Record<string, unknown>,
  navigatesAwayFromPage: boolean,
): Promise<{ ok: boolean; confirmed: boolean }> => {
  const body = JSON.stringify(payload);

  if (navigatesAwayFromPage && typeof navigator.sendBeacon === "function") {
    const queued = navigator.sendBeacon(
      "/api/leads",
      new Blob([body], { type: "application/json" }),
    );

    if (queued) {
      return Promise.resolve({ ok: true, confirmed: false });
    }
  }

  return fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then((response) => ({ ok: response.ok, confirmed: true }))
    .catch(() => ({ ok: false, confirmed: true }));
};

const getStoredLedResultsSummary = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const storedResults = window.localStorage.getItem("econoluz_led_results");

  if (!storedResults) {
    return "";
  }

  try {
    const parsedResults = JSON.parse(storedResults) as StoredLedResults;
    return parsedResults.summary ?? "";
  } catch {
    return "";
  }
};

const buildInitialFormState = () => {
  const ledResultsSummary = getStoredLedResultsSummary();

  if (!ledResultsSummary) {
    return initialFormState;
  }

  return {
    ...initialFormState,
    message: `${ledResultsSummary}\n\nNecesito asesoría para interpretar estos resultados y elegir luminarias adecuadas.`,
  };
};

const clearTemporaryQuoteData = () => {
  window.localStorage.removeItem("econoluz_led_results");
};
type ProjectAdvisoryProps = {
  /**
   * El catálogo completo. Hace falta para reconstruir la selección guardada:
   * en el almacenamiento solo viven las referencias y sus cantidades.
   */
  products: PublicProduct[];
};

/**
 * Formulario de asesoría de proyecto.
 *
 * Vivía dentro del catálogo y lo dominaba entero. Ahora tiene página propia
 * (`/asesoria`) y el catálogo solo enlaza a ella: quien entra a mirar productos
 * ve productos, y quien tiene un proyecto grande llega aquí.
 *
 * Es autónomo a propósito —su propio estado y su propia lectura de la
 * selección— para no depender del catálogo, que ya no lo contiene.
 */
export default function ProjectAdvisory({ products }: ProjectAdvisoryProps) {
  const [formState, setFormState] = useState<QuoteFormState>(buildInitialFormState);
  const [formErrors, setFormErrors] = useState<QuoteFormErrors>({});
  const [ledResultsSummary] = useState(getStoredLedResultsSummary);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const { items: quoteItems, quoteCount } = useQuoteSelection(products);
  const opensInSameTab = useSyncExternalStore(
    subscribeToUserAgent,
    isMetaInAppBrowser,
    () => false,
  );
  const requiredFieldRefs = useRef<
    Record<RequiredQuoteField, HTMLInputElement | null>
  >({ fullName: null, phone: null, email: null });

  const whatsappMessage = useMemo(() => {
    const selectedProducts = quoteItems.map(buildPublicProductLine);
    const details = [
      formState.fullName ? `Nombre: ${formState.fullName}` : "",
      formState.phone ? `Teléfono: ${formState.phone}` : "",
      formState.email ? `Email: ${formState.email}` : "",
      formState.projectType ? `Tipo de proyecto: ${formState.projectType}` : "",
      formState.estimatedArea ? `Área estimada: ${formState.estimatedArea} m²` : "",
      formState.budgetRange ? `Presupuesto: ${formState.budgetRange}` : "",
      formState.lightingType ? `Tipo de iluminación: ${formState.lightingType}` : "",
      selectedProducts.length ? `Productos: ${selectedProducts.join(", ")}` : "",
      formState.message ? `Mensaje: ${formState.message}` : "",
      ledResultsSummary ? ledResultsSummary : "",
    ].filter(Boolean);

    return `${contact.whatsappDefaultMessage}${
      details.length ? `\n${details.join("\n")}` : ""
    }`;
  }, [formState, ledResultsSummary, quoteItems]);

  const whatsappHref = `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
  const mailtoHref = `mailto:${contact.email}?subject=${encodeURIComponent(
    "Solicitud de asesoría ECONOLUZ GT",
  )}&body=${encodeURIComponent(whatsappMessage)}`;

  const invalidFieldLabels = requiredQuoteFields
    .filter((field) => formErrors[field])
    .map((field) => quoteFieldLabels[field]);
  const validationAnnouncement =
    invalidFieldLabels.length > 0
      ? `No se pudo enviar. Revisa ${invalidFieldLabels.length === 1 ? "el campo" : "los campos"}: ${invalidFieldLabels.join(", ")}.`
      : "";

  useEffect(() => {
    window.addEventListener("beforeunload", clearTemporaryQuoteData);

    return () => {
      window.removeEventListener("beforeunload", clearTemporaryQuoteData);
    };
  }, []);

  const updateFormField = (field: keyof QuoteFormState, value: string) => {
    setFormState((currentForm) => ({ ...currentForm, [field]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setSubmitStatus((currentStatus) =>
      currentStatus === "saved" || currentStatus === "error" ? "idle" : currentStatus,
    );
  };

  const validateQuoteForm = () => {
    const nextErrors: QuoteFormErrors = {};

    if (!formState.fullName.trim()) {
      nextErrors.fullName = "Ingresa tu nombre completo.";
    }

    if (!formState.phone.trim()) {
      nextErrors.phone = "Ingresa tu teléfono.";
    }

    if (!formState.email.trim()) {
      nextErrors.email = "Ingresa tu email.";
    } else if (!emailPattern.test(formState.email.trim())) {
      nextErrors.email = "Ingresa un email válido.";
    }

    setFormErrors(nextErrors);

    return nextErrors;
  };

  const focusFirstInvalidField = (errors: QuoteFormErrors) => {
    const firstInvalid = requiredQuoteFields.find((field) => errors[field]);
    const input = firstInvalid ? requiredFieldRefs.current[firstInvalid] : null;

    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center" });
  };

  const deliverLead = (navigatesAwayFromPage: boolean) => {
    setSubmitStatus("saving");

    postLead(
      {
        fullName: formState.fullName,
        phone: formState.phone,
        email: formState.email,
        projectType: formState.projectType,
        estimatedArea: formState.estimatedArea,
        budgetRange: formState.budgetRange,
        lightingType: formState.lightingType,
        message: formState.message,
        ledSummary: ledResultsSummary,
        products: quoteItems.map(buildPublicProductLine),
        source: opensInSameTab ? "in-app" : "navegador",
        website: "",
      },
      navigatesAwayFromPage,
    ).then((result) => {
      setSubmitStatus(result.ok ? "saved" : "error");
    });
  };

  const handleQuoteSubmit = (event: MouseEvent<HTMLAnchorElement>) => {
    const errors = validateQuoteForm();

    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      focusFirstInvalidField(errors);
      return;
    }

    deliverLead(opensInSameTab);
  };

  const handleQuoteFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validateQuoteForm();

    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(errors);
      return;
    }

    deliverLead(true);
    window.location.href = whatsappHref;
  };

  return (
      <section className="bg-proyectos px-5 py-20 text-white sm:px-8 lg:py-28">
        <div id="asesoria-proyecto" className="-mt-20 scroll-mt-20 pt-20" />
        <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/52">
              Asesoría de proyecto
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Define tu proyecto de iluminación con asesoría especializada.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
              Las luminarias seleccionadas en el catálogo aparecen aquí automáticamente.
              Completa los datos del proyecto para que el equipo pueda preparar una
              recomendación más precisa.
            </p>

            <div className="mt-8 border border-white/12 p-5 transition duration-500 hover:border-white/24">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm uppercase tracking-[0.2em] text-white/52">
                  Resumen
                </p>
                <p className="text-sm text-white/60">{quoteCount} unidades</p>
              </div>

              <div className="mt-5 grid max-h-72 min-h-0 gap-3 overflow-y-auto overscroll-contain pr-1">
                {quoteItems.length === 0 ? (
                  <p className="text-sm leading-6 text-white/52">
                    Aún no hay luminarias seleccionadas. Puedes enviar la solicitud
                    con datos del proyecto o agregar luminarias desde el catálogo.
                  </p>
                ) : (
                  quoteItems.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between gap-4 border-t border-white/10 pt-3"
                    >
                      <div>
                        <p className="font-semibold text-white">{item.product.publicName}</p>
                        <p className="mt-1 text-sm text-white/52">
                          Ref. {item.product.econoluzReference} / {item.quantity} unidad{item.quantity > 1 ? "es" : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">Por cotizar</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/12 pt-4">
                <p className="text-sm uppercase tracking-[0.18em] text-white/52">
                  Modalidad
                </p>
                <p className="text-2xl font-semibold">Cotización por asesoría</p>
              </div>
            </div>

            {!ledResultsSummary && (
              <div className="mt-5 border border-white/12 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/52">
                  Consejo
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  Para recibir una respuesta más precisa, puedes usar la calculadora LED
                  antes de enviar tu solicitud. Los resultados se agregarán automáticamente
                  al formulario.
                </p>
                <a
                  href="/calculadora-led"
                  className="mt-5 inline-flex text-sm font-semibold text-white underline decoration-white/30 underline-offset-8 transition hover:decoration-white"
                >
                  Usar calculadora LED
                </a>
              </div>
            )}
          </div>

          <form
            onSubmit={handleQuoteFormSubmit}
            noValidate
            className="self-start border border-white/12 bg-white p-5 text-black shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            {ledResultsSummary && (
              <div className="mb-6 border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tienda">
                  Resultados LED adjuntos
                </p>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Agregamos los resultados de la calculadora al mensaje adicional para que el
                  equipo pueda revisarlos junto con tu solicitud.
                </p>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Nombre completo</span>
                <input
                  required
                  ref={(element) => {
                    requiredFieldRefs.current.fullName = element;
                  }}
                  value={formState.fullName}
                  onChange={(event) => updateFormField("fullName", event.target.value)}
                  aria-invalid={Boolean(formErrors.fullName)}
                  aria-describedby={formErrors.fullName ? "quote-full-name-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.fullName ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="Nombre y apellido"
                />
                {formErrors.fullName && (
                  <span id="quote-full-name-error" className="text-xs font-semibold text-error">
                    {formErrors.fullName}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Teléfono</span>
                <input
                  required
                  type="tel"
                  ref={(element) => {
                    requiredFieldRefs.current.phone = element;
                  }}
                  value={formState.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                  aria-invalid={Boolean(formErrors.phone)}
                  aria-describedby={formErrors.phone ? "quote-phone-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.phone ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="+502 0000 0000"
                />
                {formErrors.phone && (
                  <span id="quote-phone-error" className="text-xs font-semibold text-error">
                    {formErrors.phone}
                  </span>
                )}
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Email</span>
                <input
                  required
                  type="email"
                  ref={(element) => {
                    requiredFieldRefs.current.email = element;
                  }}
                  value={formState.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? "quote-email-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.email ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="correo@empresa.com"
                />
                {formErrors.email && (
                  <span id="quote-email-error" className="text-xs font-semibold text-error">
                    {formErrors.email}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de proyecto</span>
                <select
                  value={formState.projectType}
                  onChange={(event) => updateFormField("projectType", event.target.value)}
                  className={`border bg-white px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.projectType ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                >
                  <option value="">Seleccionar</option>
                  {quoteProjectTypes.map((projectType) => (
                    <option key={projectType} value={projectType}>
                      {projectType}
                    </option>
                  ))}
                </select>
                {formErrors.projectType && (
                  <span className="text-xs font-medium text-neutral-600">
                    {formErrors.projectType}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Área estimada en m²</span>
                <input
                  value={formState.estimatedArea}
                  onChange={(event) => updateFormField("estimatedArea", event.target.value)}
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-proyectos"
                  placeholder="Ej. 120"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Rango de presupuesto</span>
                <select
                  required
                  value={formState.budgetRange}
                  onChange={(event) => updateFormField("budgetRange", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-proyectos"
                >
                  <option value="">Seleccionar</option>
                  {quoteBudgetRanges.map((budgetRange) => (
                    <option key={budgetRange} value={budgetRange}>
                      {budgetRange}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de iluminación</span>
                <select
                  required
                  value={formState.lightingType}
                  onChange={(event) => updateFormField("lightingType", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-proyectos"
                >
                  <option value="">Seleccionar</option>
                  {quoteLightingTypes.map((lightingType) => (
                    <option key={lightingType} value={lightingType}>
                      {lightingType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Mensaje adicional</span>
                <textarea
                  value={formState.message}
                  onChange={(event) => updateFormField("message", event.target.value)}
                  className="min-h-32 resize-none border border-neutral-200 px-4 py-3 outline-none transition focus:border-proyectos"
                  placeholder="Cuéntanos sobre ambientes, acabados, fechas o necesidades técnicas."
                />
              </label>
            </div>

            {/* Trampa para bots. Invisible y fuera del orden de tabulación:
                una persona nunca lo rellena, los formularios automáticos sí. */}
            <div aria-hidden="true" className="hidden">
              <label>
                No rellenar
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value=""
                  onChange={() => {}}
                />
              </label>
            </div>

            <p aria-live="assertive" className="sr-only">
              {validationAnnouncement}
            </p>

            {submitStatus === "saved" ? (
              <div
                role="status"
                className="mt-7 grid gap-3 border border-neutral-200 bg-neutral-50 p-5"
              >
                <p className="text-base font-semibold">Recibimos tu solicitud.</p>
                <p className="text-sm leading-6 text-neutral-600">
                  Queda guardada con tus datos y las luminarias seleccionadas. Un asesor
                  te contacta en horario de oficina: {contact.hours.toLowerCase()}.
                </p>
                <p className="mt-1 text-sm font-semibold">¿No se abrió WhatsApp?</p>
                <div className="grid gap-2 text-sm leading-6">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-black underline underline-offset-4"
                  >
                    Reintentar por WhatsApp
                  </a>
                  <a
                    href={contact.phoneHref}
                    className="text-neutral-600 underline underline-offset-4 hover:text-proyectos"
                  >
                    {contact.phoneLabel}
                  </a>
                  <a
                    href={mailtoHref}
                    className="text-neutral-600 underline underline-offset-4 hover:text-proyectos"
                  >
                    {contact.email}
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-7 grid gap-4">
                {validationAnnouncement && (
                  <p className="border border-error px-4 py-3 text-sm font-semibold text-error">
                    Revisa los campos marcados antes de enviar.
                  </p>
                )}

                {submitStatus === "error" && (
                  <div role="alert" className="grid gap-2 border border-error p-4">
                    <p className="text-sm font-semibold text-error">
                      No pudimos guardar tu solicitud.
                    </p>
                    <p className="text-sm leading-6 text-neutral-600">
                      Tus datos siguen escritos aquí. Puedes reintentar con el botón, o
                      escribirnos a{" "}
                      <a
                        href={mailtoHref}
                        className="font-semibold text-black underline underline-offset-4"
                      >
                        {contact.email}
                      </a>{" "}
                      y llegamos igual.
                    </p>
                  </div>
                )}

                <a
                  href={whatsappHref}
                  target={opensInSameTab ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={handleQuoteSubmit}
                  aria-busy={submitStatus === "saving"}
                  className="flex w-full items-center justify-center rounded-full bg-tienda px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-tienda-fuerte"
                >
                  {submitStatus === "saving"
                    ? "Enviando…"
                    : "Enviar información por WhatsApp"}
                </a>

                <p className="text-xs leading-5 text-neutral-500">
                  Guardamos tu solicitud antes de abrir WhatsApp, así que llega al equipo
                  aunque el mensaje no se llegue a enviar.
                </p>
              </div>
            )}
          </form>
        </div>
      </section>
  );
}
