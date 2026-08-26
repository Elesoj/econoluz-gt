"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import CarritoContador from "../tienda/CarritoContador";
import { isUnmodifiedPrimaryClick } from "./isUnmodifiedPrimaryClick";

type NavItem = {
  label: string;
  href: string;
};

type SiteNavbarProps = {
  items: NavItem[];
  ctaHref?: string;
  ctaLabel?: string;
  mobileCtaLabel?: string;
};

const getHash = (href: string) => {
  const hashIndex = href.indexOf("#");
  return hashIndex >= 0 ? href.slice(hashIndex) : "";
};

export default function SiteNavbar({
  items,
  ctaHref,
  ctaLabel,
  mobileCtaLabel = ctaLabel,
}: SiteNavbarProps) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeHrefRef = useRef("");

  useEffect(() => {
    const sectionItems = items
      .map((item) => ({ ...item, hash: getHash(item.href) }))
      .filter((item) => {
        if (!item.hash || pathname !== "/") {
          return false;
        }

        return item.href.startsWith("#") || item.href.startsWith("/#");
      });

    if (sectionItems.length === 0) {
      return;
    }

    let animationFrame = 0;
    let sectionPositions: { hash: string; top: number }[] = [];

    const setActiveSection = (hash: string) => {
      if (activeHrefRef.current === hash) {
        return;
      }

      activeHrefRef.current = hash;
      setActiveHref(hash);
    };

    const refreshSectionPositions = () => {
      sectionPositions = sectionItems
        .map((item) => {
          const section = document.querySelector<HTMLElement>(item.hash);

          if (!section) {
            return null;
          }

          return {
            hash: item.hash,
            top: section.getBoundingClientRect().top + window.scrollY,
          };
        })
        .filter((item): item is { hash: string; top: number } => Boolean(item))
        .sort((first, second) => first.top - second.top);
    };

    const syncActiveSection = () => {
      if (sectionPositions.length === 0) {
        refreshSectionPositions();
      }

      const scrollPosition = window.scrollY + window.innerHeight * 0.38;
      const currentSection = sectionPositions
        .filter(({ top }) => top <= scrollPosition)
        .at(-1);

      setActiveSection(currentSection?.hash ?? sectionPositions[0]?.hash ?? "");
    };

    const scheduleActiveSync = () => {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        syncActiveSection();
      });
    };

    const syncHashWithUrl = () => {
      const currentHash = window.location.hash;

      if (currentHash && sectionItems.some((item) => item.hash === currentHash)) {
        setActiveSection(currentHash);
        return true;
      }

      return false;
    };

    const handleResize = () => {
      refreshSectionPositions();
      scheduleActiveSync();
    };

    refreshSectionPositions();
    if (!syncHashWithUrl()) {
      syncActiveSection();
    }

    window.addEventListener("hashchange", syncHashWithUrl);
    window.addEventListener("scroll", scheduleActiveSync, { passive: true });
    window.addEventListener("resize", handleResize);
    window.requestAnimationFrame(() => {
      refreshSectionPositions();
      if (!syncHashWithUrl()) {
        syncActiveSection();
      }
    });

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      window.removeEventListener("hashchange", syncHashWithUrl);
      window.removeEventListener("scroll", scheduleActiveSync);
      window.removeEventListener("resize", handleResize);
    };
  }, [items, pathname]);

  const isActive = (href: string) => {
    const hash = getHash(href);

    if (hash) {
      return pathname === "/" && activeHref === hash;
    }

    return pathname === href;
  };

  const handleLinkClick = (href: string, event?: MouseEvent<HTMLAnchorElement>) => {
    setIsMobileMenuOpen(false);

    const hash = getHash(href);
    const shouldHandleInCurrentPage =
      event && isUnmodifiedPrimaryClick(event.nativeEvent);

    if (
      shouldHandleInCurrentPage &&
      pathname === "/catalogo" &&
      href === "/catalogo"
    ) {
      event.preventDefault();
      window.dispatchEvent(new Event("econoluz-catalog-reset"));
      return;
    }

    if (
      shouldHandleInCurrentPage &&
      hash &&
      (href.startsWith("#") || href.startsWith("/#"))
    ) {
      activeHrefRef.current = hash;
      setActiveHref(hash);
    }
  };

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-neutral-200 bg-white/92 text-proyectos backdrop-blur-xl">
      <div className="relative mx-auto grid h-20 w-full max-w-7xl grid-cols-[auto_auto] items-center justify-between px-5 sm:px-8 md:grid-cols-[auto_1fr_auto] md:gap-8">
        <Link
          href="/#inicio"
          onClick={(event) => handleLinkClick("/#inicio", event)}
          className="flex items-center gap-3"
          aria-label="ECONOLUZ GT inicio"
        >
          <Image
            src="/logo_econoluz.png"
            alt="ECONOLUZ GT"
            width={180}
            height={52}
            className="h-10 w-auto"
            priority
          />
          <span className="hidden text-xs font-semibold uppercase tracking-[0.28em] sm:inline">
            GT
          </span>
        </Link>

        <div
          className="hidden items-center justify-center gap-6 text-[0.9rem] font-medium text-neutral-600 md:flex lg:gap-8"
          style={{
            left: "50%",
            position: "absolute",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => handleLinkClick(item.href, event)}
              className={`relative py-7 transition hover:text-proyectos ${
                isActive(item.href) ? "text-proyectos" : ""
              }`}
            >
              {item.label}
              <span
                className={`absolute inset-x-0 bottom-0 h-px bg-tienda transition ${
                  isActive(item.href) ? "opacity-100" : "opacity-0"
                }`}
              />
            </Link>
          ))}
        </div>

        {/* Fuera del bloque de escritorio a propósito: en el móvil el CTA se
            esconde dentro del menú desplegable, pero el carrito tiene que
            verse siempre que tenga algo, sin abrir ningún menú. */}
        <div className="flex items-center justify-end">
          <CarritoContador />
        </div>

        <div className="hidden min-w-[7.25rem] items-center justify-end gap-3 md:flex">
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="rounded-full bg-tienda px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-tienda-fuerte"
            >
              {ctaLabel}
            </Link>
          )}
        </div>

        <div className="relative md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            className="group flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-300 transition hover:border-proyectos hover:bg-neutral-50"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            <span className="relative block h-3.5 w-4">
              <span
                className={`absolute left-0 h-px w-4 bg-proyectos transition ${
                  isMobileMenuOpen ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 h-px w-4 bg-proyectos transition ${
                  isMobileMenuOpen ? "bottom-2 -rotate-45" : "bottom-0"
                }`}
              />
            </span>
          </button>
          {isMobileMenuOpen && (
          <div className="absolute right-0 top-14 w-[min(86vw,22rem)] border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="grid gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => handleLinkClick(item.href, event)}
                  className={`px-3 py-3 text-base transition hover:bg-neutral-100 hover:text-proyectos ${
                    isActive(item.href) ? "bg-proyectos text-white" : "text-neutral-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            {ctaHref && mobileCtaLabel && (
              <Link
                href={ctaHref}
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-4 flex items-center justify-center rounded-full bg-tienda px-5 py-3 text-sm font-semibold text-white transition hover:bg-tienda-fuerte"
              >
                {mobileCtaLabel}
              </Link>
            )}
          </div>
          )}
        </div>
      </div>
    </nav>
  );
}
