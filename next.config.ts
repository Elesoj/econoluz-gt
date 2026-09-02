import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next 16 incluye `firebase-admin` en su lista automática de paquetes externos del
  // servidor. Dejarlo ahí hace que la función de Vercel cargue por `require()` la cadena
  // `firebase-admin` -> `jwks-rsa` -> `jose 6`, que es ESM puro, y `/cuenta` responde 500
  // con `ERR_REQUIRE_ESM`. Esta línea obliga a Turbopack a empaquetar la cadena entera.
  //
  // **No quitar sin comprobarlo en un despliegue**: el fallo no se reproduce en local —el
  // build pasa y las pruebas también— y solo aparece dentro de una función desplegada.
  // `tests/identidad-frontera.test.ts` lo vigila; ver `docs/OPERACION-FIREBASE.md` §3.
  transpilePackages: ["firebase-admin"],
  experimental: {
    serverActions: {
      // Las fotos del panel viajan dentro de la Server Action que guarda la
      // ficha, y el límite de fábrica es 1 MB: sin subirlo, cualquier foto de
      // verdad se rechaza antes de llegar a validarse.
      bodySizeLimit: "5mb",
    },
  },
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
