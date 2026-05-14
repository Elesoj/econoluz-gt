import Link from "next/link";

type ContactCTAProps = {
  eyebrow?: string;
  title: string;
  description: string;
  href: string;
  label: string;
  variant?: "dark" | "light";
};

export default function ContactCTA({
  eyebrow = "Asesoría especializada",
  title,
  description,
  href,
  label,
  variant = "dark",
}: ContactCTAProps) {
  const isDark = variant === "dark";

  return (
    <section
      className={`px-5 py-16 sm:px-8 lg:py-20 ${
        isDark ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.28em] ${
              isDark ? "text-white/46" : "text-neutral-500"
            }`}
          >
            {eyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">{title}</h2>
        </div>
        <div>
          <p
            className={`text-base leading-7 sm:text-lg sm:leading-8 ${
              isDark ? "text-white/66" : "text-neutral-600"
            }`}
          >
            {description}
          </p>
          <Link
            href={href}
            className={`mt-8 inline-flex rounded-full px-7 py-3 text-sm font-semibold transition ${
              isDark
                ? "bg-white text-black hover:bg-neutral-200"
                : "bg-black text-white hover:bg-neutral-800"
            }`}
          >
            {label}
          </Link>
        </div>
      </div>
    </section>
  );
}
