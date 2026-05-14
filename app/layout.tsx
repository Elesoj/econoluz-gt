import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "ECONOLUZ GT | Iluminación arquitectónica premium",
  description:
    "Rediseño premium de ECONOLUZ GT para luminarias LED, proyectos arquitectónicos y asesoría de iluminación en Guatemala.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <a
          href="https://wa.me/50240428790?text=Hola%2C%20quiero%20cotizar%20un%20proyecto%20de%20iluminaci%C3%B3n."
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-3 rounded-full border border-white/12 bg-black px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800 sm:bottom-8 sm:left-8"
          aria-label="Contactar por WhatsApp"
        >
          <span className="flex h-2.5 w-2.5 rounded-full bg-white" />
          WhatsApp
        </a>
      </body>
    </html>
  );
}
