"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import usePartySocket from "partysocket/react";
import type { Template, TextBlank, TextSize } from "@/lib/types";
import { GENRES, KIND_LABELS, MAX_PLAYERS, SIZE_LABELS } from "@/lib/types";
import { fillSegments } from "@/lib/game";
import { genreLabel } from "@/lib/content-shared";
import { getPartyKitHost } from "@/lib/partyhost";
import type { ClientMessage, RoomState, ServerMessage } from "@/lib/room";

type LocalPlayer = {
  id: string;
  nickname: string;
  isHost: boolean;
};

type Props = {
  code: string;
  solo: boolean;
};

export function RoomClient({ code, solo }: Props) {
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [genreFilter, setGenreFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("chepuha-player");
    if (!raw) return;
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
  }, [solo]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: { templates: Template[] }) => setTemplates(data.templates))
      .catch(() => setTemplates([]));
  }, []);

  const socket = usePartySocket({
    host: getPartyKitHost(),
    room: code,
    onOpen() {
      setConnected(true);
    },
    onClose() {
      setConnected(false);
    },
    onMessage(event) {
      try {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        if (msg.type === "state") setState(msg.state);
        if (msg.type === "error") setError(msg.message);
      } catch {
        /* ignore */
      }
    },
  });

  useEffect(() => {
    if (!player || !connected) return;
    const msg: ClientMessage = {
      type: "join",
      playerId: player.id,
      nickname: player.nickname,
    };
    socket.send(JSON.stringify(msg));
  }, [player, connected, socket]);

  const send = useCallback(
    (msg: ClientMessage) => {
      setError(null);
      socket.send(JSON.stringify(msg));
    },
    [socket],
  );

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

      {error && (
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
            Поделись кодом <span className="font-mono font-semibold">{code}</span> с друзьями.
            Когда все на месте — хост выбирает текст.
          </p>
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
              disabled={playerCount < 1}
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
                    <input
                      className="input"
                      value={draft[id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                      required
                    />
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
            const addressRole =
              line.addressRole != null ? (template.roles[line.addressRole] ?? null) : null;
            const addressId =
              line.addressRole != null ? roleToPlayer[line.addressRole] : undefined;
            const text = fillSegments(line.segments, answers);
            return (
              <div key={line.id} className="rounded-2xl bg-[var(--paper-2)] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {speakerId ? `${nick(speakerId)} как «${roleName}»` : roleName}
                  {addressRole
                    ? ` → ${addressId ? `${nick(addressId)} («${addressRole}»)` : addressRole}`
                    : ""}
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
