import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel",
  // El panel no se indexa: no es contenido público y aparecer en buscadores
  // solo sirve para que alguien encuentre la puerta.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full flex-col">{children}</div>;
}
