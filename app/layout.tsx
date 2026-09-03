import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import FloatingWhatsApp from "./components/FloatingWhatsApp";
import CarritoContador from "./tienda/CarritoContador";
import SincronizarCarrito from "./tienda/SincronizarCarrito";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ECONOLUZ GT | Catálogo de iluminación por cotización",
    template: "%s | ECONOLUZ GT",
  },
  description:
    "Catálogo premium de luminarias LED, proyectos arquitectónicos y asesoría técnica de iluminación por cotización en Guatemala.",
  keywords: [
    "ECONOLUZ GT",
    "iluminación Guatemala",
    "luminarias LED",
    "catálogo de iluminación",
    "cotización de iluminación",
    "asesoría de iluminación",
  ],
  openGraph: {
    title: "ECONOLUZ GT | Catálogo de iluminación por cotización",
    description:
      "Luminarias LED, proyectos arquitectónicos y asesoría técnica de iluminación para Guatemala.",
    locale: "es_GT",
    siteName: "ECONOLUZ GT",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      // Next 16 dejó de anular `scroll-behavior` durante la navegación: sin este
      // atributo, `scroll-smooth` hace que cada cambio de ruta anime el
      // desplazamiento en lugar de saltar, y el framework lo avisa por consola.
      // Con el atributo, Next vuelve a desactivarlo mientras navega y el scroll
      // suave se conserva solo donde interesa, en los enlaces de ancla.
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden">
        {children}
        <FloatingWhatsApp />
        <CarritoContador />
        <SincronizarCarrito />
      </body>
    </html>
  );
}
