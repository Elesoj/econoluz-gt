"use client";

import { useEffect, useState } from "react";

type StoredQuote = {
  clientName?: string;
  projectType?: string;
  estimatedArea?: string;
  budgetRange?: string;
  products?: string[];
};

const whatsappNumber = "50240428790";
const defaultMessage = "Hola, quiero cotizar un proyecto de iluminación.";

const buildMessage = (quote: StoredQuote | null) => {
  if (!quote) {
    return defaultMessage;
  }

  const details = [
    quote.clientName ? `Nombre: ${quote.clientName}` : "",
    quote.projectType ? `Tipo de proyecto: ${quote.projectType}` : "",
    quote.estimatedArea ? `Área estimada: ${quote.estimatedArea} m²` : "",
    quote.budgetRange ? `Presupuesto: ${quote.budgetRange}` : "",
    quote.products?.length ? `Productos: ${quote.products.join(", ")}` : "",
  ].filter(Boolean);

  if (details.length === 0) {
    return defaultMessage;
  }

  return `Hola, quiero cotizar un proyecto de iluminación.\n${details.join("\n")}`;
};

export default function FloatingWhatsApp() {
  const [message, setMessage] = useState(defaultMessage);

  useEffect(() => {
    const syncQuote = () => {
      const storedQuote = window.localStorage.getItem("econoluz_quote_context");

      if (!storedQuote) {
        setMessage(defaultMessage);
        return;
      }

      try {
        setMessage(buildMessage(JSON.parse(storedQuote) as StoredQuote));
      } catch {
        setMessage(defaultMessage);
      }
    };

    syncQuote();
    window.addEventListener("storage", syncQuote);
    window.addEventListener("econoluz-quote-updated", syncQuote);

    return () => {
      window.removeEventListener("storage", syncQuote);
      window.removeEventListener("econoluz-quote-updated", syncQuote);
    };
  }, []);

  return (
    <a
      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-3 rounded-full border border-white/12 bg-black px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800 sm:bottom-8 sm:left-8"
      aria-label="Contactar por WhatsApp"
    >
      <span className="flex h-2.5 w-2.5 rounded-full bg-white" />
      WhatsApp
    </a>
  );
}
