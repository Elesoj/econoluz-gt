import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  align?: "left" | "center";
  invert?: boolean;
};

export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  invert = false,
}: SectionHeaderProps) {
  const isCentered = align === "center";

  return (
    <div
      className={`grid gap-6 ${
        isCentered ? "mx-auto max-w-3xl text-center" : "md:grid-cols-[0.85fr_1.15fr] md:items-end"
      }`}
    >
      <div>
        <p
          className={`text-xs font-semibold uppercase tracking-[0.28em] ${
            invert ? "text-white/46" : "text-neutral-500"
          }`}
        >
          {eyebrow}
        </p>
        <h2
          className={`mt-4 text-4xl font-semibold leading-tight sm:text-5xl ${
            invert ? "text-white" : "text-black"
          }`}
        >
          {title}
        </h2>
      </div>

      {(description || action) && (
        <div className={isCentered ? "" : "md:justify-self-end"}>
          {description && (
            <p
              className={`max-w-2xl text-base leading-7 sm:text-lg sm:leading-8 ${
                invert ? "text-white/66" : "text-neutral-600"
              }`}
            >
              {description}
            </p>
          )}
          {action && <div className="mt-6">{action}</div>}
        </div>
      )}
    </div>
  );
}
