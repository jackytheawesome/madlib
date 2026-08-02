"use client";

import { useMemo, useState } from "react";
import type { GenreId, Template, TextKind, TextSize } from "@/lib/types";
import { GENRES, KIND_LABELS, SIZE_LABELS } from "@/lib/types";
import { hydrateEditorFromTemplate } from "@/lib/editor-hydrate";

type BlankMeta = {
  id: string;
  prompt: string;
  example: string;
  /** исходное слово, которое заменили */
  original: string;
};

type Atom =
  | { key: string; kind: "text"; value: string }
  | { key: string; kind: "blank"; blankId: string };

type DialogueLineDraft = {
  key: string;
  speakerRole: number;
  addressRole: number | null;
  atoms: Atom[];
};

type HintDraft = {
  pos: string;
  caseName: string;
  number: string;
  gender: string;
  verbForm: string;
  custom: string;
  example: string;
};

const POS_OPTIONS = [
  "",
  "существительное",
  "прилагательное",
  "глагол",
  "наречие",
  "междометие",
  "имя собственное",
  "профессия",
  "часть тела",
  "чувство",
  "звук",
];

const CASE_OPTIONS = [
  "",
  "именительный падеж",
  "родительный падеж",
  "дательный падеж",
  "винительный падеж",
  "творительный падеж",
  "предложный падеж",
];

const NUMBER_OPTIONS = ["", "единственное число", "множественное число"];
const GENDER_OPTIONS = ["", "мужской род", "женский род", "средний род"];
const VERB_OPTIONS = [
  "",
  "инфинитив",
  "прошедшее время",
  "настоящее время",
  "повелительное наклонение",
];

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "template"
  );
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Разбивает текст на слова и «склейку» (пробелы/пунктуация) */
function tokenize(raw: string): Atom[] {
  const parts = raw.split(/(\s+|[.,!?;:…«»""„"()\[\]—–-]+)/);
  return parts
    .filter((p) => p.length > 0)
    .map((value) => ({ key: uid("t"), kind: "text" as const, value }));
}

function composePrompt(h: HintDraft): string {
  if (h.custom.trim()) return h.custom.trim();
  const bits = [h.pos, h.caseName, h.number, h.gender, h.verbForm].filter(Boolean);
  return bits.join(", ") || "существительное, именительный падеж";
}

function parsePromptToHint(prompt: string, example: string): HintDraft {
  const lower = prompt.toLowerCase();
  const find = (opts: string[]) => opts.find((o) => o && lower.includes(o)) ?? "";
  return {
    pos: find(POS_OPTIONS),
    caseName: find(CASE_OPTIONS),
    number: find(NUMBER_OPTIONS),
    gender: find(GENDER_OPTIONS),
    verbForm: find(VERB_OPTIONS),
    custom: "",
    example,
  };
}

function atomsToSegments(atoms: Atom[], blanks: Record<string, BlankMeta>) {
  const segments: { type: "text" | "blank"; value?: string; blankId?: string }[] = [];
  for (const atom of atoms) {
    if (atom.kind === "text") {
      if (!atom.value) continue;
      const last = segments[segments.length - 1];
      if (last?.type === "text") last.value = (last.value ?? "") + atom.value;
      else segments.push({ type: "text", value: atom.value });
    } else {
      segments.push({ type: "blank", blankId: atom.blankId });
    }
  }
  // ensure blanks referenced exist
  void blanks;
  return segments;
}

function collectBlankOrder(atomsLists: Atom[][]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const atoms of atomsLists) {
    for (const a of atoms) {
      if (a.kind === "blank" && !seen.has(a.blankId)) {
        seen.add(a.blankId);
        order.push(a.blankId);
      }
    }
  }
  return order;
}

export function TemplateDraftForm({ initialTemplate }: { initialTemplate?: Template }) {
  const [seed] = useState(() =>
    initialTemplate ? hydrateEditorFromTemplate(initialTemplate) : null,
  );
  const isEdit = Boolean(seed);

  const [templateId, setTemplateId] = useState(
    seed?.templateId ?? "",
  );
  const [title, setTitle] = useState(seed?.title ?? "");
  const [kind, setKind] = useState<TextKind>(seed?.kind ?? "story");
  const [genre, setGenre] = useState<GenreId>(seed?.genre ?? "everyday");
  const [size, setSize] = useState<TextSize>(seed?.size ?? "small");
  const [playerCount, setPlayerCount] = useState(seed?.playerCount ?? 2);
  const [roles, setRoles] = useState<string[]>(
    seed?.roles ?? ["Алекс", "Мила"],
  );

  const defaultSource = "Однажды кошка встретила батарею и сказала привет.";
  const [sourceText, setSourceText] = useState(seed?.sourceText ?? defaultSource);
  const [atoms, setAtoms] = useState<Atom[]>(
    () => seed?.atoms ?? tokenize(defaultSource),
  );
  const [lines, setLines] = useState<DialogueLineDraft[]>(
    () =>
      seed?.lines ?? [
        {
          key: uid("l"),
          speakerRole: 0,
          addressRole: 1,
          atoms: tokenize("Привет! Я принёс круассан."),
        },
        {
          key: uid("l"),
          speakerRole: 1,
          addressRole: 0,
          atoms: tokenize("Спасибо. Давай выпьем чай."),
        },
      ],
  );

  const [blanks, setBlanks] = useState<Record<string, BlankMeta>>(
    () => seed?.blanks ?? {},
  );
  const [selectedBlankId, setSelectedBlankId] = useState<string | null>(null);
  const [hintDraft, setHintDraft] = useState<HintDraft>({
    pos: "существительное",
    caseName: "именительный падеж",
    number: "единственное число",
    gender: "",
    verbForm: "",
    custom: "",
    example: "",
  });

  const blankOrder = useMemo(() => {
    if (kind === "dialogue") return collectBlankOrder(lines.map((l) => l.atoms));
    return collectBlankOrder([atoms]);
  }, [kind, lines, atoms]);

  const selectedBlank = selectedBlankId ? blanks[selectedBlankId] : null;

  function syncRoles(count: number) {
    setPlayerCount(count);
    setRoles((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(`Роль ${next.length + 1}`);
      return next.slice(0, count);
    });
  }

  function loadSourceIntoEditor() {
    if (kind === "dialogue") {
      const rawLines = sourceText
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      setLines(
        rawLines.map((line, index) => {
          const m = line.match(/^(\d+)\s*:\s*(.*)$/);
          const speakerRole = m ? Math.max(0, Number(m[1]) - 1) : index % playerCount;
          const content = m ? m[2] : line;
          return {
            key: uid("l"),
            speakerRole: Math.min(speakerRole, playerCount - 1),
            addressRole: (speakerRole + 1) % playerCount,
            atoms: tokenize(content),
          };
        }),
      );
      setBlanks({});
      setSelectedBlankId(null);
      return;
    }
    setAtoms(tokenize(sourceText));
    setBlanks({});
    setSelectedBlankId(null);
  }

  function markAtomAsBlank(
    scope: "mono" | number,
    atomKey: string,
    value: string,
  ) {
    // ignore pure whitespace/punct-only
    if (!/[0-9A-Za-zА-Яа-яЁё]/.test(value)) return;

    const blankId = uid("b");
    const meta: BlankMeta = {
      id: blankId,
      original: value,
      prompt: "существительное, именительный падеж, единственное число",
      example: value,
    };

    setBlanks((b) => ({ ...b, [blankId]: meta }));
    setSelectedBlankId(blankId);
    setHintDraft(parsePromptToHint(meta.prompt, meta.example));

    const replace = (list: Atom[]) =>
      list.map((a) =>
        a.key === atomKey && a.kind === "text"
          ? ({ key: a.key, kind: "blank", blankId } as Atom)
          : a,
      );

    if (scope === "mono") setAtoms((prev) => replace(prev));
    else {
      setLines((prev) =>
        prev.map((line, i) => (i === scope ? { ...line, atoms: replace(line.atoms) } : line)),
      );
    }
  }

  function unmarkBlank(blankId: string) {
    const original = blanks[blankId]?.original ?? "…";
    const restore = (list: Atom[]) =>
      list.map((a) =>
        a.kind === "blank" && a.blankId === blankId
          ? ({ key: a.key, kind: "text", value: original } as Atom)
          : a,
      );

    setAtoms((prev) => restore(prev));
    setLines((prev) => prev.map((l) => ({ ...l, atoms: restore(l.atoms) })));
    setBlanks((b) => {
      const next = { ...b };
      delete next[blankId];
      return next;
    });
    if (selectedBlankId === blankId) setSelectedBlankId(null);
  }

  function openBlank(blankId: string) {
    const meta = blanks[blankId];
    if (!meta) return;
    setSelectedBlankId(blankId);
    setHintDraft(parsePromptToHint(meta.prompt, meta.example));
  }

  function withCurrentHint(blankMap: Record<string, BlankMeta>) {
    if (!selectedBlankId || !blankMap[selectedBlankId]) return blankMap;
    return {
      ...blankMap,
      [selectedBlankId]: {
        ...blankMap[selectedBlankId],
        prompt: composePrompt(hintDraft),
        example: hintDraft.example.trim(),
      },
    };
  }

  function applyHint() {
    if (!selectedBlankId) return;
    setBlanks((b) => withCurrentHint(b));
  }

  function addDialogueLine() {
    setLines((prev) => [
      ...prev,
      {
        key: uid("l"),
        speakerRole: prev.length % playerCount,
        addressRole: (prev.length + 1) % playerCount,
        atoms: tokenize("Новая реплика."),
      },
    ]);
  }

  function removeDialogueLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const jsonPreview = useMemo(() => {
    const id =
      (isEdit && templateId.trim()) ||
      `${kind}-${genre}-${size}-${slugify(title || "draft")}`;
    const liveBlanks = withCurrentHint(blanks);
    const orderedIds = blankOrder;
    const renumber = new Map(orderedIds.map((oldId, i) => [oldId, `b${i + 1}`]));

    const blankDefs = orderedIds.map((oldId, i) => {
      const meta = liveBlanks[oldId];
      return {
        id: `b${i + 1}`,
        hint: {
          prompt: meta?.prompt || "существительное, именительный падеж",
          ...(meta?.example ? { example: meta.example } : {}),
        },
      };
    });

    function remapSegments(list: Atom[]) {
      return atomsToSegments(list, liveBlanks).map((s) => {
        if (s.type === "blank" && s.blankId) {
          return { type: "blank" as const, blankId: renumber.get(s.blankId) ?? s.blankId };
        }
        return s;
      });
    }

    if (kind === "dialogue") {
      return {
        id,
        title: title || "Без названия",
        kind,
        genre,
        size,
        playerCount: playerCount as 2 | 3 | 4,
        roles: roles.slice(0, playerCount),
        blanks: blankDefs,
        lines: lines.map((line, index) => ({
          id: `l${index + 1}`,
          speakerRole: line.speakerRole,
          ...(line.addressRole != null ? { addressRole: line.addressRole } : {}),
          segments: remapSegments(line.atoms),
        })),
      };
    }

    return {
      id,
      title: title || "Без названия",
      kind,
      genre,
      size,
      playerCount: null,
      blanks: blankDefs,
      segments: remapSegments(atoms),
    };
  }, [
    kind,
    genre,
    size,
    title,
    playerCount,
    roles,
    lines,
    atoms,
    blanks,
    blankOrder,
    selectedBlankId,
    hintDraft,
    isEdit,
    templateId,
  ]);

  function download() {
    applyHint();
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

  function renderAtoms(list: Atom[], scope: "mono" | number) {
    return (
      <div className="markup-canvas rounded-2xl border border-[var(--line)] bg-white p-4 leading-8">
        {list.map((atom) => {
          if (atom.kind === "text") {
            const clickable = /[0-9A-Za-zА-Яа-яЁё]/.test(atom.value);
            if (!clickable) {
              return (
                <span key={atom.key} className="whitespace-pre-wrap text-[var(--ink)]">
                  {atom.value}
                </span>
              );
            }
            return (
              <button
                key={atom.key}
                type="button"
                className="markup-word rounded px-0.5 text-[var(--ink)] transition hover:bg-[var(--paper-2)]"
                title="Сделать пропуском"
                onClick={() => markAtomAsBlank(scope, atom.key, atom.value)}
              >
                {atom.value}
              </button>
            );
          }

          const meta = blanks[atom.blankId];
          const active = selectedBlankId === atom.blankId;
          return (
            <button
              key={atom.key}
              type="button"
              className={`markup-blank mx-0.5 inline-flex items-center rounded-lg px-2 py-0.5 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[color-mix(in_oklab,var(--accent)_22%,white)] text-[var(--ink)]"
              }`}
              title={meta?.prompt}
              onClick={() => openBlank(atom.blankId)}
            >
              [{meta?.original || "…"}]
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel grid gap-4 p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm text-[var(--ink-soft)]">Название</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {isEdit && (
          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm text-[var(--ink-soft)]">ID файла (имя JSON)</span>
            <input
              className="input font-mono text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            />
          </label>
        )}
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
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[var(--ink-soft)]">Размер</span>
          <select
            className="input"
            value={size}
            onChange={(e) => setSize(e.target.value as TextSize)}
          >
            {(Object.keys(SIZE_LABELS) as TextSize[]).map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {kind === "dialogue" && (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-soft)]">Игроков / ролей</span>
            <select
              className="input"
              value={playerCount}
              onChange={(e) => syncRoles(Number(e.target.value))}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {kind === "dialogue" && (
        <div className="panel space-y-3 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Роли
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.slice(0, playerCount).map((role, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">Роль {i + 1}</span>
                <input
                  className="input"
                  value={role}
                  onChange={(e) =>
                    setRoles((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="panel space-y-3 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          1. Вставьте исходный текст
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          {kind === "dialogue"
            ? "Каждая строка — реплика. Можно писать «1: текст» (номер роли)."
            : "Обычный текст целиком. Потом отметите слова-пропуски кликом."}
        </p>
        <textarea
          className="input min-h-28 font-mono text-sm"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={loadSourceIntoEditor}>
          Загрузить в визуальный редактор
        </button>
      </div>

      <div className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              2. Визуальная разметка
            </h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Клик по слову → пропуск. Клик по оранжевому блоку → правка подсказки.
            </p>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">Пропусков: {blankOrder.length}</p>
        </div>

        {kind !== "dialogue" && renderAtoms(atoms, "mono")}

        {kind === "dialogue" && (
          <div className="space-y-4">
            {lines.map((line, lineIndex) => (
              <div key={line.key} className="space-y-2 rounded-2xl bg-[var(--paper-2)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--ink-muted)]">Говорит</span>
                    <select
                      className="input w-auto py-1"
                      value={line.speakerRole}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, speakerRole: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    >
                      {roles.slice(0, playerCount).map((r, i) => (
                        <option key={i} value={i}>
                          {r || `Роль ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--ink-muted)]">к</span>
                    <select
                      className="input w-auto py-1"
                      value={line.addressRole ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...l,
                                  addressRole:
                                    e.target.value === "" ? null : Number(e.target.value),
                                }
                              : l,
                          ),
                        )
                      }
                    >
                      <option value="">—</option>
                      {roles.slice(0, playerCount).map((r, i) => (
                        <option key={i} value={i}>
                          {r || `Роль ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost ml-auto py-1 text-sm"
                    onClick={() => removeDialogueLine(line.key)}
                  >
                    Удалить реплику
                  </button>
                </div>
                {renderAtoms(line.atoms, lineIndex)}
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addDialogueLine}>
              + Реплика
            </button>
          </div>
        )}
      </div>

      {selectedBlank && (
        <div className="panel space-y-4 border-[var(--accent)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Подсказка к «{selectedBlank.original}»
            </h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => unmarkBlank(selectedBlank.id)}
            >
              Вернуть слово
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Часть речи</span>
              <select
                className="input"
                value={hintDraft.pos}
                onChange={(e) => setHintDraft((h) => ({ ...h, pos: e.target.value, custom: "" }))}
              >
                {POS_OPTIONS.map((o) => (
                  <option key={o || "empty"} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Падеж</span>
              <select
                className="input"
                value={hintDraft.caseName}
                onChange={(e) =>
                  setHintDraft((h) => ({ ...h, caseName: e.target.value, custom: "" }))
                }
              >
                {CASE_OPTIONS.map((o) => (
                  <option key={o || "empty"} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Число</span>
              <select
                className="input"
                value={hintDraft.number}
                onChange={(e) =>
                  setHintDraft((h) => ({ ...h, number: e.target.value, custom: "" }))
                }
              >
                {NUMBER_OPTIONS.map((o) => (
                  <option key={o || "empty"} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Род</span>
              <select
                className="input"
                value={hintDraft.gender}
                onChange={(e) =>
                  setHintDraft((h) => ({ ...h, gender: e.target.value, custom: "" }))
                }
              >
                {GENDER_OPTIONS.map((o) => (
                  <option key={o || "empty"} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Форма глагола</span>
              <select
                className="input"
                value={hintDraft.verbForm}
                onChange={(e) =>
                  setHintDraft((h) => ({ ...h, verbForm: e.target.value, custom: "" }))
                }
              >
                {VERB_OPTIONS.map((o) => (
                  <option key={o || "empty"} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Пример</span>
              <input
                className="input"
                value={hintDraft.example}
                onChange={(e) => setHintDraft((h) => ({ ...h, example: e.target.value }))}
                placeholder="кошка"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-[var(--ink-muted)]">
                Своя формулировка (если заполнить — заменит сборку выше)
              </span>
              <input
                className="input"
                value={hintDraft.custom}
                onChange={(e) => setHintDraft((h) => ({ ...h, custom: e.target.value }))}
                placeholder="или напишите подсказку вручную"
              />
            </label>
          </div>

          <p className="rounded-xl bg-[var(--paper-2)] px-3 py-2 text-sm text-[var(--ink-soft)]">
            Игрок увидит: <strong className="text-[var(--ink)]">{composePrompt(hintDraft)}</strong>
            {hintDraft.example ? (
              <>
                {" "}
                (например: {hintDraft.example})
              </>
            ) : null}
          </p>

          <button type="button" className="btn btn-primary" onClick={applyHint}>
            Сохранить подсказку
          </button>
        </div>
      )}

      {blankOrder.length > 0 && (
        <div className="panel space-y-3 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Все пропуски
          </h2>
          <ul className="space-y-2">
            {blankOrder.map((id, i) => {
              const meta = blanks[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-xl bg-[var(--paper-2)] px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--accent)_12%,white)]"
                    onClick={() => openBlank(id)}
                  >
                    <span className="text-sm text-[var(--ink)]">
                      <span className="font-semibold">{i + 1}. [{meta?.original}]</span>
                      <span className="text-[var(--ink-muted)]"> — {meta?.prompt}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="panel space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            JSON
          </h2>
          <button type="button" className="btn btn-primary" onClick={download}>
            {isEdit ? "Скачать обновлённый JSON" : "Скачать JSON"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[var(--ink)] p-4 text-xs leading-relaxed text-[var(--paper)]">
          {JSON.stringify(jsonPreview, null, 2)}
        </pre>
        <p className="text-xs text-[var(--ink-muted)]">
          {isEdit ? (
            <>
              Замените файл <code>content/templates/{templateId || "…"}.json</code> в
              репозитории и задеплойте.
            </>
          ) : (
            <>
              Положите файл в <code>content/templates/</code> и задеплойте — текст появится
              в игре.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
