import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { TemplateDraftForm } from "@/components/TemplateDraftForm";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadTemplate } from "@/lib/content";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminEditPage({ params }: Props) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const template = await loadTemplate(decodeURIComponent(id));
  if (!template) notFound();

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
          Редактировать: {template.title}
        </h1>
        <p className="mb-6 text-sm text-[var(--ink-soft)]">
          Правьте разметку визуально, затем нажмите «Сохранить в базу» — изменения сразу
          попадут в Neon и в игру.
        </p>
        <TemplateDraftForm initialTemplate={template} />
      </main>
    </div>
  );
}
