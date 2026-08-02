"use client";

import { useMemo, useState } from "react";
import type { GenreId, TextKind } from "@/lib/types";
import { GENRES, KIND_LABELS } from "@/lib/types";

type DraftBlank = {
  id: string;
  token: string;
  prompt: string;
  example: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "template";
}

export function TemplateDraftForm() {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TextKind>("story");
  const [genre, setGenre] = useState<GenreId>("everyday");
  const [playerCount, setPlayerCount] = useState(2);
  const [rolesRaw, setRolesRaw] = useState("Алекс, Мила");
  const [body, setBody] = useState(
    "Однажды {{1}} встретил {{2}} и сказал: «Привет!»",
  );
  const [prompts, setPrompts] = useState<Record<string, { prompt: string; example: string }>>(
    {},
  );

  const tokens = useMemo(() => {
    const found = [...body.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g)].map(
      (m) => m[1],
    );
    return [...new Set(found)];
  }, [body]);

  const blanks: DraftBlank[] = tokens.map((token, i) => ({
    id: `b${i + 1}`,
    token,
    prompt: prompts[token]?.prompt || "существительное, именительный падеж",
    example: prompts[token]?.example || "",
  }));

  const jsonPreview = useMemo(() => {
    const id = `${kind}-${genre}-${slugify(title || "draft")}`;
    const blankByToken = Object.fromEntries(blanks.map((b) => [b.token, b]));

    function parseSegments(text: string) {
      const parts: { type: "text" | "blank"; value?: string; blankId?: string }[] =
        [];
      const re = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > last) {
          parts.push({ type: "text", value: text.slice(last, m.index) });
        }
        const blank = blankByToken[m[1]];
        parts.push({ type: "blank", blankId: blank?.id ?? m[1] });
        last = m.index + m[0].length;
      }
      if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
      return parts;
    }

    const blankDefs = blanks.map((b) => ({
      id: b.id,
      hint: {
        prompt: b.prompt,
        ...(b.example ? { example: b.example } : {}),
      },
    }));

    if (kind === "dialogue") {
      const roles = rolesRaw
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      const lines = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const roleMatch = line.match(/^(\d+)\s*:\s*(.*)$/);
          const speakerRole = roleMatch ? Number(roleMatch[1]) - 1 : index % roles.length;
          const content = roleMatch ? roleMatch[2] : line;
          return {
            id: `l${index + 1}`,
            speakerRole,
            segments: parseSegments(content),
          };
        });

      return {
        id,
        title: title || "Без названия",
        kind,
        genre,
        playerCount,
        roles,
        blanks: blankDefs,
        lines,
      };
    }

    return {
      id,
      title: title || "Без названия",
      kind,
      genre,
      playerCount: null,
      blanks: blankDefs,
      segments: parseSegments(body),
    };
  }, [title, kind, genre, playerCount, rolesRaw, body, blanks]);

  function download() {
    const blob = new Blob([JSON.stringify(jsonPreview, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jsonPreview.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="panel grid gap-4 p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm text-[var(--ink-soft)]">Название</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[var(--ink-soft)]">Тип</span>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as TextKind)}
          >
            {(Object.keys(KIND_LABELS) as TextKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[var(--ink-soft)]">Жанр</span>
          <select
            className="input"
            value={genre}
            onChange={(e) => setGenre(e.target.value as GenreId)}
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        {kind === "dialogue" && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-[var(--ink-soft)]">Игроков / ролей</span>
              <select
                className="input"
                value={playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
              >
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-[var(--ink-soft)]">Роли через запятую</span>
              <input
                className="input"
                value={rolesRaw}
                onChange={(e) => setRolesRaw(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm text-[var(--ink-soft)]">
            Текст с пропусками{" "}
            <code className="text-xs">{"{{1}}"}</code>,{" "}
            <code className="text-xs">{"{{2}}"}</code>…
            {kind === "dialogue" && (
              <>
                {" "}
                Строка = реплика, можно{" "}
                <code className="text-xs">1: текст</code> (номер роли)
              </>
            )}
          </span>
          <textarea
            className="input min-h-40 font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
      </div>

      <div className="panel space-y-4 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          Подсказки к пропускам
        </h2>
        {blanks.length === 0 && (
          <p className="text-sm text-[var(--ink-muted)]">
            Добавьте маркеры вида {"{{1}}"} в текст.
          </p>
        )}
        {blanks.map((b) => (
          <div key={b.token} className="grid gap-3 rounded-xl bg-[var(--paper-2)] p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm font-medium text-[var(--ink)]">
              {"{{"}
              {b.token}
              {"}}"} → {b.id}
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Подсказка</span>
              <input
                className="input"
                value={prompts[b.token]?.prompt ?? b.prompt}
                onChange={(e) =>
                  setPrompts((p) => ({
                    ...p,
                    [b.token]: {
                      prompt: e.target.value,
                      example: p[b.token]?.example ?? "",
                    },
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Пример</span>
              <input
                className="input"
                value={prompts[b.token]?.example ?? ""}
                onChange={(e) =>
                  setPrompts((p) => ({
                    ...p,
                    [b.token]: {
                      prompt: p[b.token]?.prompt ?? b.prompt,
                      example: e.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>
        ))}
      </div>

      <div className="panel space-y-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            JSON
          </h2>
          <button type="button" className="btn btn-primary" onClick={download}>
            Скачать JSON
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[var(--ink)] p-4 text-xs leading-relaxed text-[var(--paper)]">
          {JSON.stringify(jsonPreview, null, 2)}
        </pre>
        <p className="text-xs text-[var(--ink-muted)]">
          Положите файл в <code>content/templates/</code> и задеплойте — текст
          появится в игре.
        </p>
      </div>
    </div>
  );
}
