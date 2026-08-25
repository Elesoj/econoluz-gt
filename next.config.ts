import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    // Las fotos que se suben desde el panel viven en Vercel Blob, fuera del
    // repositorio. `next/image` se niega a servir imágenes de un dominio que no
    // esté declarado aquí, así que sin esto las fotos nuevas no se verían.
    //
    // El subdominio lo pone Vercel a partir del identificador del almacén; por
    // eso el comodín, y no un dominio escrito a mano que habría que cambiar si
    // algún día se crea otro almacén.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
