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
      <body className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden">
        {children}
        <FloatingWhatsApp />
      </body>
    </html>
  );
}
