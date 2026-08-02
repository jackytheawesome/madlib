import Link from "next/link";

type Props = {
  href?: string;
  size?: "sm" | "lg";
};

/** Место под логотип — пока текстовая марка */
export function BrandMark({ href = "/", size = "lg" }: Props) {
  const mark = (
    <span className="brand-mark inline-flex items-center gap-3">
      <span
        className={
          size === "lg"
            ? "logo-slot flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-[var(--ink-muted)] bg-[var(--paper-2)] text-[10px] uppercase tracking-wider text-[var(--ink-muted)]"
            : "logo-slot flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--ink-muted)] bg-[var(--paper-2)] text-[8px] uppercase tracking-wider text-[var(--ink-muted)]"
        }
        aria-hidden
      >
        лого
      </span>
      <span
        className={
          size === "lg"
            ? "font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl"
            : "font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)]"
        }
      >
        Чепуха
      </span>
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="no-underline transition-opacity hover:opacity-80">
      {mark}
    </Link>
  );
}
