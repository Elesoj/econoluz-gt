import type { InternalProduct } from "./products";
import { toPublicProduct, type PublicProduct } from "./publicProduct";
import { aCentavos, aQuetzales } from "../lib/dinero";

/**
 * Traducción entre el producto interno y su fila en `public_products`.
 *
 * La limpieza de privacidad NO se reescribe aquí: se delega en
 * `toPublicProduct`, que es exactamente el mismo código que hoy protege el
 * catálogo. Lo único que cambia es el momento en que se ejecuta, que pasa de la
 * lectura a la escritura. Por eso la fila que sale ya está saneada y el rol
 * público no puede ver un texto sin limpiar: en su lado no existe ninguno.
 */

export type FilaProyeccion = {
  id: string;
  econoluz_reference: string;
  position: number;
  public_name: string;
  public_description: string;
  image: string;
  images: string[] | null;
  product_type: string;
  application: string;
  finish: string;
  label_product_type: string;
  label_application: string;
  label_finish: string;
  technical_specs: Record<string, string | string[]> | null;
  price_cents: number | null;
};

export function aFilaProyeccion(
  producto: InternalProduct,
  precioGtq: number | null,
  position: number,
): FilaProyeccion {
  // El precio se le entrega a la frontera vigente en lugar de convertirlo
  // aquí: es `toPublicProduct` quien decide si un importe es publicable
  // —número finito y mayor que cero— y la proyección no puede tener una regla
  // distinta, o volvería a abrirse la puerta que se cerró en `2b32049`.
  const publico = toPublicProduct(producto, { priceGtq: precioGtq });

  return {
    id: publico.id,
    econoluz_reference: publico.econoluzReference,
    position,
    public_name: publico.publicName,
    public_description: publico.publicDescription,
    image: publico.image,
    images: publico.images ?? null,
    product_type: publico.productType,
    application: publico.application,
    finish: publico.finish,
    label_product_type: publico.labels.productType,
    label_application: publico.labels.application,
    label_finish: publico.labels.finish,
    technical_specs: publico.technicalSpecs
      ? (publico.technicalSpecs as Record<string, string | string[]>)
      : null,
    // Solo hay centavos si el producto público conservó su precio. Un cero,
    // un negativo, un `NaN` o un `Infinity` no llegan hasta aquí.
    price_cents:
      typeof publico.priceGtq === "number" ? aCentavos(publico.priceGtq) : null,
  };
}

export function desdeFilaProyeccion(fila: FilaProyeccion): PublicProduct {
  const producto: PublicProduct = {
    id: fila.id,
    econoluzReference: fila.econoluz_reference,
    publicName: fila.public_name,
    publicDescription: fila.public_description,
    image: fila.image,
    productType: fila.product_type,
    application: fila.application,
    finish: fila.finish,
    labels: {
      productType: fila.label_product_type,
      application: fila.label_application,
      finish: fila.label_finish,
    },
    technicalSpecs: fila.technical_specs ?? undefined,
  };

  if (fila.images?.length) {
    producto.images = fila.images;
  }

  // Mismo criterio que la frontera pública: solo un importe finito y mayor
  // que cero es un precio. `null`, cero y cualquier resto raro significan
  // «todavía sin precio», y la tarjeta dirá «Consultar precio».
  if (
    typeof fila.price_cents === "number" &&
    Number.isFinite(fila.price_cents) &&
    fila.price_cents > 0
  ) {
    producto.priceGtq = aQuetzales(fila.price_cents);
  }

  return producto;
}
