"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  getFloatingQuoteServerSnapshot,
  getFloatingQuoteSnapshot,
  subscribeToFloatingQuote,
} from "../catalogo/floatingQuoteStore";
import { contact } from "../data/siteData";

const legacyQuoteContextKey = "econoluz_quote_context";
let hasAttemptedLegacyContextCleanup = false;

export default function FloatingWhatsApp() {
  const pathname = usePathname();
  const message = useSyncExternalStore(
    subscribeToFloatingQuote,
    getFloatingQuoteSnapshot,
    getFloatingQuoteServerSnapshot,
  );

  useEffect(() => {
    if (hasAttemptedLegacyContextCleanup) {
      return;
    }

    hasAttemptedLegacyContextCleanup = true;

    try {
      const storage = window.localStorage;

      if (storage.getItem(legacyQuoteContextKey) !== null) {
        storage.removeItem(legacyQuoteContextKey);
      }
    } catch {
      // El almacenamiento puede estar bloqueado en navegadores internos.
    }
  }, []);

  // El panel es una herramienta interna: ofrecer ahí el WhatsApp comercial no
  // tiene sentido y además tapa la interfaz. El sitio público no cambia.
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <a
      href={`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      // El borde va marcado porque este botón flota tanto sobre secciones
      // claras como sobre las de azul marino, donde un azul sobre azul perdería
      // el contorno por completo.
      className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-3 rounded-full border border-white/35 bg-proyectos px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-proyectos-fuerte sm:bottom-8 sm:left-8"
      aria-label="Contactar por WhatsApp"
    >
      <span className="flex h-2.5 w-2.5 rounded-full bg-white" />
      WhatsApp
    </a>
  );
}
