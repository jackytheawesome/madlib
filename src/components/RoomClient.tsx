"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Template, TextBlank } from "@/lib/types";
import { GENRES, KIND_LABELS, MAX_PLAYERS } from "@/lib/types";
import { distributeBlanks, fillSegments } from "@/lib/game";
import { genreLabel } from "@/lib/content-shared";

type LocalPlayer = {
  id: string;
  nickname: string;
  isHost: boolean;
};

type Phase = "lobby" | "picking" | "filling" | "reveal";

type Props = {
  code: string;
  solo: boolean;
};

export function RoomClient({ code, solo }: Props) {
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [myBlankIds, setMyBlankIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = sessionStorage.getItem("chepuha-player");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LocalPlayer & { roomCode?: string };
        setPlayer({
          id: parsed.id,
          nickname: parsed.nickname,
          isHost: parsed.isHost || solo,
        });
      } catch {
        setPlayer(null);
      }
    }
  }, [solo]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: { templates: Template[] }) => setTemplates(data.templates))
      .catch(() => setTemplates([]));
  }, []);

  // Пока локальный прототип: 1 игрок. После PartyKit — реальное число в комнате.
  const playerCount: number = 1;

  const available = useMemo(() => {
    return templates.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (genreFilter !== "all" && t.genre !== genreFilter) return false;
      if (t.kind === "dialogue") {
        return t.playerCount === playerCount;
      }
      return true;
    });
  }, [templates, kindFilter, genreFilter, playerCount]);

  const blankMap = useMemo(() => {
    if (!selected) return new Map<string, TextBlank>();
    return new Map(selected.blanks.map((b) => [b.id, b]));
  }, [selected]);

  const startWithTemplate = useCallback(
    (tpl: Template) => {
      if (!player) return;
      setSelected(tpl);
      const dist = distributeBlanks(tpl.blanks, [player.id]);
      setMyBlankIds(dist[player.id] ?? []);
      setDraft({});
      setAnswers({});
      setPhase("filling");
    },
    [player],
  );

  function submitAnswers(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...answers };
    for (const id of myBlankIds) {
      next[id] = draft[id]?.trim() || "???";
    }
    setAnswers(next);
    setPhase("reveal");
  }

  function pickAnother() {
    setSelected(null);
    setPhase("picking");
  }

  function randomAnother() {
    if (available.length === 0) return;
    const tpl = available[Math.floor(Math.random() * available.length)];
    startWithTemplate(tpl);
  }

  if (!player) {
    return (
      <div className="panel mx-auto max-w-lg p-6 text-center">
        <p className="mb-4 text-[var(--ink-soft)]">Сначала укажи ник на главной.</p>
        <a href="/" className="btn btn-primary inline-flex">
          На главную
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--ink-muted)]">Комната</p>
          <p className="font-mono text-2xl tracking-[0.2em] text-[var(--ink)]">{code}</p>
        </div>
        <div className="text-right text-sm text-[var(--ink-soft)]">
          <p>
            Ты: <span className="font-medium text-[var(--ink)]">{player.nickname}</span>
            {player.isHost ? " · хост" : ""}
            {solo ? " · соло" : ""}
          </p>
          <p className="text-[var(--ink-muted)]">
            Игроков: {playerCount}/{MAX_PLAYERS}
            {!solo && (
              <span className="ml-1">(мультиплеер подключаем следующим шагом)</span>
            )}
          </p>
        </div>
      </header>

      {phase === "lobby" && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Лобби
          </h2>
          <p className="text-[var(--ink-soft)]">
            Поделись кодом с друзьями. Когда все на месте — хост выбирает текст и
            запускает игру.
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 rounded-xl bg-[var(--paper-2)] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              {player.nickname}
              {player.isHost ? " (хост)" : ""}
            </li>
          </ul>
          {player.isHost && (
            <button type="button" className="btn btn-primary" onClick={() => setPhase("picking")}>
              Выбрать текст
            </button>
          )}
        </section>
      )}

      {phase === "picking" && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Выбор текста
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="all">Все типы</option>
              <option value="story">Рассказ</option>
              <option value="monologue">Монолог</option>
              <option value="dialogue">Диалог ({playerCount} чел.)</option>
            </select>
            <select
              className="input w-auto"
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
            >
              <option value="all">Все жанры</option>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={randomAnother}>
              Случайный
            </button>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {available.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-[var(--ink)]">{t.title}</p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {KIND_LABELS[t.kind]} · {genreLabel(t.genre)}
                    {t.kind === "dialogue" ? ` · ${t.playerCount} игрока` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary shrink-0"
                  onClick={() => startWithTemplate(t)}
                >
                  Играть
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <li className="py-6 text-center text-[var(--ink-muted)]">
                Нет подходящих текстов. Для диалогов нужен набор ровно на {playerCount}{" "}
                игроков.
              </li>
            )}
          </ul>
        </section>
      )}

      {phase === "filling" && selected && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Заполни слова
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Текст скрыт. Пиши что угодно — чем неожиданнее, тем смешнее.
          </p>
          <form onSubmit={submitAnswers} className="space-y-4">
            {myBlankIds.map((id, i) => {
              const blank = blankMap.get(id);
              if (!blank) return null;
              return (
                <label key={id} className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {i + 1}. {blank.hint.prompt}
                  </span>
                  {blank.hint.example && (
                    <span className="text-xs text-[var(--ink-muted)]">
                      например: {blank.hint.example}
                    </span>
                  )}
                  <input
                    className="input"
                    value={draft[id] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [id]: e.target.value }))
                    }
                    required
                  />
                </label>
              );
            })}
            <button type="submit" className="btn btn-primary">
              Готово
            </button>
          </form>
        </section>
      )}

      {phase === "reveal" && selected && (
        <Reveal
          template={selected}
          answers={answers}
          onPick={pickAnother}
          onRandom={randomAnother}
        />
      )}
    </div>
  );
}

function Reveal({
  template,
  answers,
  onPick,
  onRandom,
}: {
  template: Template;
  answers: Record<string, string>;
  onPick: () => void;
  onRandom: () => void;
}) {
  if (template.kind === "dialogue") {
    return (
      <section className="panel space-y-5 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
          {template.title}
        </h2>
        <p className="text-sm text-[var(--ink-muted)]">Читайте по ролям</p>
        <div className="space-y-4">
          {template.lines.map((line) => {
            const speaker = template.roles[line.speakerRole] ?? `Роль ${line.speakerRole + 1}`;
            const address =
              line.addressRole != null
                ? (template.roles[line.addressRole] ?? null)
                : null;
            const text = fillSegments(line.segments, answers);
            return (
              <div key={line.id} className="rounded-2xl bg-[var(--paper-2)] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {speaker}
                  {address ? ` → ${address}` : ""}
                </p>
                <p className="text-lg leading-relaxed text-[var(--ink)]">{highlight(text, answers)}</p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={onRandom}>
            Ещё случайный
          </button>
          <button type="button" className="btn btn-secondary" onClick={onPick}>
            Выбрать другой
          </button>
        </div>
      </section>
    );
  }

  const text = fillSegments(template.segments, answers);
  return (
    <section className="panel space-y-5 p-6">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
        {template.title}
      </h2>
      <p className="text-lg leading-relaxed text-[var(--ink)]">{highlight(text, answers)}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={onRandom}>
          Ещё случайный
        </button>
        <button type="button" className="btn btn-secondary" onClick={onPick}>
          Выбрать другой
        </button>
      </div>
    </section>
  );
}

function highlight(text: string, answers: Record<string, string>) {
  const values = Object.values(answers).filter(Boolean);
  if (values.length === 0) return text;

  const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    values.some((v) => v.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="filled-word">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
