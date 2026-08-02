import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { GenreId, Template, TextKind } from "./types";
import { GENRES } from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content", "templates");

function isTemplate(value: unknown): value is Template {
  if (!value || typeof value !== "object") return false;
  const t = value as Template;
  return typeof t.id === "string" && typeof t.title === "string" && Array.isArray(t.blanks);
}

export async function loadAllTemplates(): Promise<Template[]> {
  const files = await readdir(CONTENT_DIR);
  const templates: Template[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isTemplate(parsed)) templates.push(parsed);
  }

  return templates.sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

export async function loadTemplate(id: string): Promise<Template | null> {
  const all = await loadAllTemplates();
  return all.find((t) => t.id === id) ?? null;
}

export function filterTemplates(
  templates: Template[],
  opts: {
    kind?: TextKind;
    genre?: GenreId;
    playerCount?: number;
  },
): Template[] {
  return templates.filter((t) => {
    if (opts.kind && t.kind !== opts.kind) return false;
    if (opts.genre && t.genre !== opts.genre) return false;
    if (opts.playerCount != null) {
      if (t.kind === "dialogue") {
        return t.playerCount === opts.playerCount;
      }
    }
    return true;
  });
}

export function genreLabel(id: GenreId): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

/** Клиентский импорт: бандл JSON через статический манифест */
export { GENRES };
