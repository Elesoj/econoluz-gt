import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import FloatingWhatsApp from "./components/FloatingWhatsApp";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden">
        {children}
        <FloatingWhatsApp />
      </body>
    </html>
  );
}
