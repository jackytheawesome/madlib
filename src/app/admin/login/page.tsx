"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Неверный пароль");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-atmosphere opacity-50" aria-hidden />
      <div className="relative z-10 w-full max-w-sm space-y-6">
        <BrandMark size="sm" href="/" />
        <form onSubmit={onSubmit} className="panel space-y-4 p-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Админка
          </h1>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-soft)]">Пароль</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="text-sm text-[var(--accent)]" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
