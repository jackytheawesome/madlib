import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { HomeActions } from "@/components/HomeActions";

export const metadata: Metadata = {
  title: "Чепуха — игра для компании",
  description:
    "Собери друзей, заполните пропуски вслепую — и читайте получившуюся чепуху вслух.",
};

export default function HomePage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-atmosphere" aria-hidden />
      <header className="relative z-10 mx-auto w-full max-w-5xl px-6 pt-6">
        <Link href="/" className="btn btn-ghost text-sm">
          <span aria-hidden>←</span> Все игры
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-20">
        <div className="max-w-xl space-y-5">
          <BrandMark />
          <p className="max-w-md text-lg leading-relaxed text-[var(--ink-soft)]">
            Собери друзей, заполните пропуски вслепую — и читайте получившуюся
            чепуху вслух.
          </p>
        </div>
        <HomeActions />
      </main>
    </div>
  );
}
