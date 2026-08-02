import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { genreLabel, loadAllTemplates } from "@/lib/content";
import { KIND_LABELS, SIZE_LABELS } from "@/lib/types";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const templates = await loadAllTemplates();

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <BrandMark size="sm" href="/" />
        <AdminLogoutButton />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
              Тексты
            </h1>
            <p className="text-sm text-[var(--ink-soft)]">
              {templates.length} шт. Откройте любой текст для визуальной правки разметки.
            </p>
          </div>
          <Link href="/admin/new" className="btn btn-primary">
            Новый текст
          </Link>
        </div>

        <ul className="panel divide-y divide-[var(--line)]">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--ink)]">{t.title}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {KIND_LABELS[t.kind]} · {genreLabel(t.genre)} · {SIZE_LABELS[t.size]} ·{" "}
                  {t.blanks.length} пропусков
                  {t.kind === "dialogue" ? ` · ${t.playerCount} игрока` : ""}
                </p>
                <code className="text-xs text-[var(--ink-muted)]">{t.id}</code>
              </div>
              <Link
                href={`/admin/edit/${encodeURIComponent(t.id)}`}
                className="btn btn-secondary shrink-0"
              >
                Править
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
