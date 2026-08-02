import { asc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { templates } from "./schema";
import type { GenreId, Template, TextKind, TextSize } from "@/lib/types";

export async function listTemplatesFromDb(): Promise<Template[]> {
  const db = getDb();
  const rows = await db.select().from(templates).orderBy(asc(templates.title));
  return rows.map((r) => r.data);
}

export async function getTemplateFromDb(id: string): Promise<Template | null> {
  const db = getDb();
  const rows = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
  return rows[0]?.data ?? null;
}

export async function upsertTemplateToDb(template: Template): Promise<void> {
  const db = getDb();
  const row = {
    id: template.id,
    title: template.title,
    kind: template.kind,
    genre: template.genre,
    size: template.size,
    playerCount: template.kind === "dialogue" ? template.playerCount : null,
    data: template,
    updatedAt: new Date(),
  };

  await db
    .insert(templates)
    .values({ ...row, createdAt: new Date() })
    .onConflictDoUpdate({
      target: templates.id,
      set: {
        title: row.title,
        kind: row.kind,
        genre: row.genre,
        size: row.size,
        playerCount: row.playerCount,
        data: row.data,
        updatedAt: row.updatedAt,
      },
    });
}

export async function deleteTemplateFromDb(id: string): Promise<void> {
  const db = getDb();
  await db.delete(templates).where(eq(templates.id, id));
}

export function filterTemplateList(
  list: Template[],
  opts: {
    kind?: TextKind;
    genre?: GenreId;
    size?: TextSize;
    playerCount?: number;
  },
): Template[] {
  return list.filter((t) => {
    if (opts.kind && t.kind !== opts.kind) return false;
    if (opts.genre && t.genre !== opts.genre) return false;
    if (opts.size && t.size !== opts.size) return false;
    if (opts.playerCount != null && t.kind === "dialogue") {
      return t.playerCount === opts.playerCount;
    }
    return true;
  });
}
