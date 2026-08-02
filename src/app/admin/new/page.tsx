import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { TemplateDraftForm } from "@/components/TemplateDraftForm";

export default async function AdminNewPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <BrandMark size="sm" href="/admin" />
        <Link href="/admin" className="btn btn-ghost">
          К списку
        </Link>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Новый текст
        </h1>
        <p className="mb-6 text-sm text-[var(--ink-soft)]">
          Визуальная разметка и сохранение в Neon одной кнопкой. JSON можно скачать как
          бэкап.
        </p>
        <TemplateDraftForm />
      </main>
    </div>
  );
}
