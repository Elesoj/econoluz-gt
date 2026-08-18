"use client";

type FilterChipProps = {
  label: string;
  /** Número de productos que quedarían al aplicar este filtro. */
  count?: number;
  isActive?: boolean;
  /** Marca el chip de "sin dato": no es un valor, es la ausencia de ficha. */
  isMissingData?: boolean;
  onToggle: () => void;
};

/**
 * Chip de filtro por especificación.
 *
 * Se usa en grupos largos, así que va como `button` con `aria-pressed`: un
 * lector de pantalla anuncia el estado sin necesitar texto adicional.
 *
 * La altura mínima es de 2.25rem (36 px) para cumplir el mínimo táctil de
 * 24x24 px de WCAG 2.2 §2.5.8 con margen. El catálogo anterior tenía
 * controles de 6 px de alto.
 */
export default function FilterChip({
  label,
  count,
  isActive = false,
  isMissingData = false,
  onToggle,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isActive}
      className={`inline-flex min-h-9 items-center gap-2 border px-3 py-1.5 font-mono text-xs font-semibold transition ${
        isActive
          ? "border-proyectos bg-proyectos text-white"
          : isMissingData
            ? "border-dashed border-neutral-300 bg-white text-neutral-500 hover:border-neutral-500 hover:text-black"
            : "border-neutral-200 bg-white text-neutral-700 hover:border-proyectos hover:text-proyectos"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={`tabular-nums text-[0.65rem] font-medium ${
            isActive ? "text-white/70" : "text-neutral-400"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
