"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Template, TextBlank, TextSize } from "@/lib/types";
import { GENRES, KIND_LABELS, MAX_PLAYERS, SIZE_LABELS } from "@/lib/types";
import { fillSegments } from "@/lib/game";
import { genreLabel } from "@/lib/content-shared";
import { RANDOM_NICKNAMES, randomNickname } from "@/lib/nicknames";
import { randomWordForHint } from "@/lib/random-words";
import type { ClientMessage, RoomState } from "@/lib/room";

type LocalPlayer = {
  id: string;
  nickname: string;
  isHost: boolean;
};

type Props = {
  code: string;
  solo: boolean;
};

const PLAYER_KEY = "chepuha-player";
const POLL_MS = 1200;

function newPlayerId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}`;
}

function savePlayer(player: LocalPlayer, roomCode: string) {
  sessionStorage.setItem(PLAYER_KEY, JSON.stringify({ ...player, roomCode }));
}

export function RoomClient({ code, solo }: Props) {
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [gateReady, setGateReady] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [nickError, setNickError] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [genreFilter, setGenreFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(PLAYER_KEY);
    if (!raw) {
      setGateReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as LocalPlayer & { roomCode?: string };
      const nick = parsed.nickname?.trim() ?? "";
      const sameRoom = parsed.roomCode?.toUpperCase() === code.toUpperCase();
      if (sameRoom && nick) {
        setPlayer({
          id: parsed.id,
          nickname: nick,
          isHost: Boolean(parsed.isHost) || solo,
        });
      } else if (nick) {
        setNickDraft(nick);
      }
    } catch {
      /* ignore */
    }
    setGateReady(true);
  }, [code, solo]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: { templates: Template[] }) => setTemplates(data.templates))
      .catch(() => setTemplates([]));
  }, []);

  const postMessage = useCallback(
    async (msg: ClientMessage, playerId: string) => {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, playerId }),
      });
      const data = (await res.json()) as { state?: RoomState; error?: string };
      if (data.state) setState(data.state);
      if (data.error) setError(data.error);
      else setError(null);
      setConnected(res.ok || Boolean(data.state));
      return data;
    },
    [code],
  );

  const send = useCallback(
    (msg: ClientMessage) => {
      if (!player) return;
      setError(null);
      void postMessage(msg, player.id);
    },
    [player, postMessage],
  );

  // join + poll
  useEffect(() => {
    if (!player) return;
    let cancelled = false;

    async function sync(join: boolean) {
      try {
        if (join) {
          await postMessage(
            { type: "join", playerId: player!.id, nickname: player!.nickname },
            player!.id,
          );
        } else {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(player!.id)}`,
          );
          const data = (await res.json()) as { state?: RoomState; error?: string };
          if (cancelled) return;
          if (data.state) setState(data.state);
          if (data.error) setError(data.error);
          setConnected(res.ok);
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setError("Не удалось подключиться к комнате. Обнови страницу.");
        }
      }
    }

    void sync(true);
    const timer = setInterval(() => void sync(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [player, code, postMessage]);

  function enterWithNickname(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickDraft.trim();
    if (!nick) {
      setNickError("Напиши ник");
      return;
    }
    const next: LocalPlayer = {
      id: newPlayerId(),
      nickname: nick,
      isHost: solo,
    };
    savePlayer(next, code);
    setPlayer(next);
    setNickError(null);
  }

  function rollNickname() {
    let next = randomNickname();
    if (next === nickDraft.trim() && RANDOM_NICKNAMES.length > 1) {
      next = randomNickname();
    }
    setNickDraft(next);
    setNickError(null);
  }

  async function copyInviteLink() {
    const url = `${window.location.origin}/room/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError(`Ссылка: ${url}`);
    }
  }

  const me = state?.players.find((p) => p.id === player?.id);
  const playerCount = state?.players.length ?? 0;
  const isHost = Boolean(me?.isHost);

  const available = useMemo(() => {
    return templates.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (genreFilter !== "all" && t.genre !== genreFilter) return false;
      if (sizeFilter !== "all" && t.size !== sizeFilter) return false;
      if (t.kind === "dialogue") return t.playerCount === playerCount;
      return true;
    });
  }, [templates, kindFilter, genreFilter, sizeFilter, playerCount]);

  const myBlankIds = state && player ? (state.assignments[player.id] ?? []) : [];
  const blankMap = useMemo(() => {
    const map = new Map<string, TextBlank>();
    state?.template?.blanks.forEach((b) => map.set(b.id, b));
    return map;
  }, [state?.template]);

  function startWithTemplate(tpl: Template) {
    setDraft({});
    send({ type: "startGame", template: tpl });
  }

  function submitAnswers(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    const answers: Record<string, string> = {};
    for (const id of myBlankIds) {
      answers[id] = draft[id]?.trim() || "???";
    }
    send({ type: "submitAnswers", playerId: player.id, answers });
  }

  function randomAnother() {
    if (available.length === 0) return;
    const tpl = available[Math.floor(Math.random() * available.length)];
    setDraft({});
    send({ type: "nextRound", mode: "random", template: tpl });
  }

  if (!gateReady) {
    return (
      <div className="panel mx-auto max-w-lg p-6 text-center text-[var(--ink-soft)]">
        Загрузка…
      </div>
    );
  }

  if (!player) {
    return (
      <div className="panel mx-auto max-w-lg space-y-5 p-6">
        <div className="text-center">
          <p className="text-sm text-[var(--ink-muted)]">Вход в комнату</p>
          <p className="font-mono text-2xl tracking-[0.2em] text-[var(--ink)]">{code}</p>
        </div>
        <p className="text-center text-[var(--ink-soft)]">
          Придумай ник — и сразу окажешься в лобби с друзьями.
        </p>
        <form onSubmit={enterWithNickname} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--ink-soft)]">Твой ник</span>
            <div className="flex gap-2">
              <input
                value={nickDraft}
                onChange={(e) => {
                  setNickDraft(e.target.value);
                  setNickError(null);
                }}
                maxLength={24}
                placeholder="например, Кефир"
                className="input min-w-0 flex-1"
                autoComplete="nickname"
                autoFocus
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0 px-3 sm:px-4"
                onClick={rollNickname}
                title="Случайный ник"
                aria-label="Сгенерировать случайный ник"
              >
                <span className="sm:hidden" aria-hidden>
                  ∗
                </span>
                <span className="hidden sm:inline">Случ.</span>
              </button>
            </div>
          </label>
          {nickError && (
            <p className="text-sm text-[var(--accent)]" role="alert">
              {nickError}
            </p>
          )}
          <button type="submit" className="btn btn-primary">
            Войти в комнату
          </button>
        </form>
      </div>
    );
  }

  const phase = state?.phase ?? "lobby";

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
            {isHost ? " · хост" : ""}
            {solo ? " · соло" : ""}
          </p>
          <p className="text-[var(--ink-muted)]">
            Игроков: {playerCount}/{MAX_PLAYERS}
            {!connected ? " · подключение…" : ""}
          </p>
        </div>
      </header>

      {(error) && (
        <p className="rounded-xl bg-[color-mix(in_oklab,var(--accent)_18%,white)] px-4 py-3 text-sm text-[var(--ink)]">
          {error}
        </p>
      )}

      {phase === "lobby" && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Лобби
          </h2>
          <p className="text-[var(--ink-soft)]">
            Поделись ссылкой или кодом <span className="font-mono font-semibold">{code}</span>.
            Когда все на месте — хост выбирает текст.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={copyInviteLink}>
              {linkCopied ? "Ссылка скопирована" : "Скопировать ссылку"}
            </button>
          </div>
          <ul className="space-y-2">
            {(state?.players ?? []).map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-[var(--paper-2)] px-3 py-2"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                {p.nickname}
                {p.isHost ? " (хост)" : ""}
                {p.id === player.id ? " — ты" : ""}
              </li>
            ))}
          </ul>
          {isHost && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "setPhase", phase: "picking" })}
              disabled={playerCount < 1 || !connected}
            >
              Выбрать текст
            </button>
          )}
          {!isHost && (
            <p className="text-sm text-[var(--ink-muted)]">Ждём, пока хост выберет текст…</p>
          )}
        </section>
      )}

      {phase === "picking" && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Выбор текста
          </h2>
          {!isHost ? (
            <p className="text-[var(--ink-soft)]">Хост выбирает текст…</p>
          ) : (
            <>
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
                <select
                  className="input w-auto"
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                >
                  <option value="all">Любой размер</option>
                  {(Object.keys(SIZE_LABELS) as TextSize[]).map((s) => (
                    <option key={s} value={s}>
                      {SIZE_LABELS[s]}
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
                        {KIND_LABELS[t.kind]} · {genreLabel(t.genre)} · {SIZE_LABELS[t.size]}
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
            </>
          )}
        </section>
      )}

      {phase === "filling" && state?.template && (
        <section className="panel space-y-4 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Заполни слова
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Текст скрыт. Пиши что угодно — чем неожиданнее, тем смешнее.
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            Сдали:{" "}
            {state.players.filter((p) => state.submitted[p.id]).length}/{state.players.length}
          </p>
          {state.submitted[player.id] ? (
            <p className="text-[var(--ink-soft)]">Ждём остальных…</p>
          ) : (
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
                    <div className="flex gap-2">
                      <input
                        className="input min-w-0 flex-1"
                        value={draft[id] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0 px-3"
                        title="Случайное слово"
                        aria-label="Сгенерировать случайное слово"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            [id]: randomWordForHint(blank.hint.prompt, d[id]),
                          }))
                        }
                      >
                        🎲
                      </button>
                    </div>
                  </label>
                );
              })}
              <button type="submit" className="btn btn-primary">
                Готово
              </button>
            </form>
          )}
        </section>
      )}

      {phase === "reveal" && state?.template && (
        <Reveal
          template={state.template}
          answers={state.answers}
          players={state.players}
          roleToPlayer={state.roleToPlayer}
          isHost={isHost}
          onPick={() => send({ type: "nextRound", mode: "pick" })}
          onRandom={randomAnother}
        />
      )}
    </div>
  );
}

function Reveal({
  template,
  answers,
  players,
  roleToPlayer,
  isHost,
  onPick,
  onRandom,
}: {
  template: Template;
  answers: Record<string, string>;
  players: { id: string; nickname: string }[];
  roleToPlayer: Record<number, string>;
  isHost: boolean;
  onPick: () => void;
  onRandom: () => void;
}) {
  const nick = (playerId: string) =>
    players.find((p) => p.id === playerId)?.nickname ?? "Игрок";

  if (template.kind === "dialogue") {
    return (
      <section className="panel space-y-5 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
          {template.title}
        </h2>
        <p className="text-sm text-[var(--ink-muted)]">Читайте по ролям</p>
        <div className="space-y-4">
          {template.lines.map((line) => {
            const roleName = template.roles[line.speakerRole] ?? `Роль ${line.speakerRole + 1}`;
            const speakerId = roleToPlayer[line.speakerRole];
            const addressId =
              line.addressRole != null ? roleToPlayer[line.addressRole] : undefined;
            const text = fillSegments(line.segments, answers);
            const speakerLabel = speakerId ? nick(speakerId) : roleName;
            const addressLabel =
              line.addressRole != null
                ? addressId
                  ? nick(addressId)
                  : (template.roles[line.addressRole] ?? `Роль ${line.addressRole + 1}`)
                : null;
            return (
              <div key={line.id} className="rounded-2xl bg-[var(--paper-2)] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {speakerLabel}
                  {addressLabel ? ` → ${addressLabel}` : ""}
                </p>
                <p className="text-lg leading-relaxed text-[var(--ink)]">
                  {highlight(text, answers)}
                </p>
              </div>
            );
          })}
        </div>
        {isHost && (
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={onRandom}>
              Ещё случайный
            </button>
            <button type="button" className="btn btn-secondary" onClick={onPick}>
              Выбрать другой
            </button>
          </div>
        )}
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
      {isHost && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={onRandom}>
            Ещё случайный
          </button>
          <button type="button" className="btn btn-secondary" onClick={onPick}>
            Выбрать другой
          </button>
        </div>
      )}
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
