import Link from "next/link";

type Props = {
  href?: string;
  size?: "sm" | "lg";
};

/** Текстовая марка «Чепуха» */
export function BrandMark({ href = "/", size = "lg" }: Props) {
  const mark = (
    <span
      className={
        size === "lg"
          ? "font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl"
          : "font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)]"
      }
    >
      Чепуха
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="no-underline transition-opacity hover:opacity-80">
      {mark}
    </Link>
  );
}
