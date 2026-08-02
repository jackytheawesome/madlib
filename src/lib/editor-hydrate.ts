import type { Template, TextSegment } from "./types";

export type EditorAtom =
  | { key: string; kind: "text"; value: string }
  | { key: string; kind: "blank"; blankId: string };

export type EditorBlankMeta = {
  id: string;
  prompt: string;
  example: string;
  original: string;
};

export type EditorDialogueLine = {
  key: string;
  speakerRole: number;
  addressRole: number | null;
  atoms: EditorAtom[];
};

export type EditorHydration = {
  title: string;
  kind: Template["kind"];
  genre: Template["genre"];
  size: Template["size"];
  playerCount: number;
  roles: string[];
  atoms: EditorAtom[];
  lines: EditorDialogueLine[];
  blanks: Record<string, EditorBlankMeta>;
  sourceText: string;
  /** сохраняем исходный id при правке */
  templateId: string;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function segmentsToAtoms(
  segments: TextSegment[],
  blanks: Record<string, EditorBlankMeta>,
): EditorAtom[] {
  const atoms: EditorAtom[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      atoms.push({ key: uid("t"), kind: "text", value: seg.value });
    } else {
      atoms.push({ key: uid("t"), kind: "blank", blankId: seg.blankId });
      if (!blanks[seg.blankId]) {
        blanks[seg.blankId] = {
          id: seg.blankId,
          prompt: "существительное, именительный падеж",
          example: "",
          original: "…",
        };
      }
    }
  }
  return atoms;
}

function segmentsToPlain(segments: TextSegment[], blanks: Template["blanks"]): string {
  const byId = Object.fromEntries(blanks.map((b) => [b.id, b]));
  return segments
    .map((s) => {
      if (s.type === "text") return s.value;
      const b = byId[s.blankId];
      return b?.hint.example || `[${s.blankId}]`;
    })
    .join("");
}

export function hydrateEditorFromTemplate(template: Template): EditorHydration {
  const blanks: Record<string, EditorBlankMeta> = {};
  for (const b of template.blanks) {
    blanks[b.id] = {
      id: b.id,
      prompt: b.hint.prompt,
      example: b.hint.example ?? "",
      original: b.hint.example?.trim() || b.id,
    };
  }

  if (template.kind === "dialogue") {
    const lines: EditorDialogueLine[] = template.lines.map((line) => ({
      key: uid("l"),
      speakerRole: line.speakerRole,
      addressRole: line.addressRole ?? null,
      atoms: segmentsToAtoms(line.segments, blanks),
    }));
    const sourceText = template.lines
      .map((line, i) => {
        const plain = segmentsToPlain(line.segments, template.blanks);
        return `${line.speakerRole + 1}: ${plain}`;
      })
      .join("\n");

    return {
      title: template.title,
      kind: template.kind,
      genre: template.genre,
      size: template.size,
      playerCount: template.playerCount,
      roles: [...template.roles],
      atoms: [],
      lines,
      blanks,
      sourceText,
      templateId: template.id,
    };
  }

  const atoms = segmentsToAtoms(template.segments, blanks);
  return {
    title: template.title,
    kind: template.kind,
    genre: template.genre,
    size: template.size,
    playerCount: 2,
    roles: ["Алекс", "Мила"],
    atoms,
    lines: [],
    blanks,
    sourceText: segmentsToPlain(template.segments, template.blanks),
    templateId: template.id,
  };
}
