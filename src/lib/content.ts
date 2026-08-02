import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { GenreId, Template, TextKind, TextSize } from "./types";
import { GENRES } from "./types";
import {
  filterTemplateList,
  getTemplateFromDb,
  listTemplatesFromDb,
} from "./db/templates";

const CONTENT_DIR = path.join(process.cwd(), "content", "templates");

function isTemplate(value: unknown): value is Template {
  if (!value || typeof value !== "object") return false;
  const t = value as Template;
  return typeof t.id === "string" && typeof t.title === "string" && Array.isArray(t.blanks);
}

async function loadAllFromDisk(): Promise<Template[]> {
  const files = await readdir(CONTENT_DIR);
  const list: Template[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isTemplate(parsed)) list.push(parsed);
  }
  return list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

function hasDatabaseUrl() {
  return Boolean(
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL,
  );
}

export async function loadAllTemplates(): Promise<Template[]> {
  if (hasDatabaseUrl()) {
    try {
      const fromDb = await listTemplatesFromDb();
      if (fromDb.length > 0) return fromDb;
    } catch (err) {
      console.error("DB load failed, falling back to disk", err);
    }
  }
  return loadAllFromDisk();
}

export async function loadTemplate(id: string): Promise<Template | null> {
  if (hasDatabaseUrl()) {
    try {
      const row = await getTemplateFromDb(id);
      if (row) return row;
    } catch (err) {
      console.error("DB get failed, falling back to disk", err);
    }
  }
  const all = await loadAllFromDisk();
  return all.find((t) => t.id === id) ?? null;
}

export function filterTemplates(
  list: Template[],
  opts: {
    kind?: TextKind;
    genre?: GenreId;
    size?: TextSize;
    playerCount?: number;
  },
): Template[] {
  return filterTemplateList(list, opts);
}

export function genreLabel(id: GenreId): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

export { GENRES };
