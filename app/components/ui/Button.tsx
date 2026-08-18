import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Variantes de botón.
 *
 * `proyectos` y `tienda` codifican la pista de negocio, según la regla de
 * CLAUDE.md §3: el color identifica el recorrido, no decora. Antes de usar
 * `tienda` en un control, comprueba que de verdad lleva a comprar.
 *
 * `neutral` es el negro que ya usa el sitio, para acciones que no pertenecen
 * a ninguna de las dos pistas.
 *
 * `contorno` e `invertido` son para fondos claros y oscuros respectivamente.
 * Sobre secciones oscuras nunca se usan `proyectos` ni `tienda` como relleno:
 * el azul marino es inservible sobre negro (1.23:1) y el rojo no llega a AA.
 */
type ButtonVariant = "proyectos" | "tienda" | "neutral" | "contorno" | "invertido";

const variantClasses: Record<ButtonVariant, string> = {
  proyectos: "bg-proyectos text-white hover:bg-proyectos-fuerte",
  tienda: "bg-tienda text-white hover:bg-tienda-fuerte",
  neutral: "bg-black text-white hover:bg-neutral-800",
  contorno: "border border-black text-black hover:bg-black hover:text-white",
  invertido: "bg-white text-black hover:bg-neutral-200",
};

type CommonProps = {
  variant?: ButtonVariant;
  /** Ocupa todo el ancho disponible. Útil en móvil. */
  isFullWidth?: boolean;
  children: ReactNode;
  className?: string;
};

// Se mantiene por encima del mínimo táctil de 24x24 px de WCAG 2.2 §2.5.8
// con holgura: 2.75rem son 44 px, la referencia cómoda en móvil.
const baseClasses =
  "inline-flex min-h-11 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition duration-300 disabled:cursor-not-allowed disabled:opacity-45";

const composeClasses = (
  variant: ButtonVariant,
  isFullWidth: boolean,
  className?: string,
) =>
  [
    baseClasses,
    variantClasses[variant],
    isFullWidth ? "w-full" : "w-fit",
    className,
  ]
    .filter(Boolean)
    .join(" ");

type ButtonProps = CommonProps & ComponentProps<"button">;

export function Button({
  variant = "neutral",
  isFullWidth = false,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={composeClasses(variant, isFullWidth, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps & ComponentProps<typeof Link>;

/**
 * Misma apariencia que `Button`, pero navega.
 *
 * Importa la distinción: una acción que abre otra página debe ser un enlace,
 * no un botón con `window.open`. Un clic sobre un enlace es una navegación y
 * el navegador no la bloquea; una apertura programática sí, y es lo que hacía
 * perder solicitudes en el formulario de asesoría.
 */
export function ButtonLink({
  variant = "neutral",
  isFullWidth = false,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={composeClasses(variant, isFullWidth, className)} {...rest}>
      {children}
    </Link>
  );
}
