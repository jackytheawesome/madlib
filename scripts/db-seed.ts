/**
 * Заливает content/templates/*.json в Neon.
 * Запуск: npx tsx scripts/db-seed.ts
 */
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { templates } from "../src/lib/db/schema";
import type { Template } from "../src/lib/types";

config({ path: ".env.local" });

/** Правки из админки — не перезаписываем при сиде. */
const PROTECTED_IDS = new Set(["story-horror-small-2"]);

async function main() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }

  const dir = path.join(process.cwd(), "content", "templates");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const db = drizzle(neon(url));

  let n = 0;
  let skipped = 0;
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf8");
    const data = JSON.parse(raw) as Template;
    if (!data.id || !data.title) {
      console.warn("skip invalid", file);
      continue;
    }
    if (PROTECTED_IDS.has(data.id)) {
      console.log("skip protected", data.id);
      skipped++;
      continue;
    }
    await db
      .insert(templates)
      .values({
        id: data.id,
        title: data.title,
        kind: data.kind,
        genre: data.genre,
        size: data.size,
        playerCount: data.kind === "dialogue" ? data.playerCount : null,
        data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: templates.id,
        set: {
          title: data.title,
          kind: data.kind,
          genre: data.genre,
          size: data.size,
          playerCount: data.kind === "dialogue" ? data.playerCount : null,
          data,
          updatedAt: new Date(),
        },
      });
    n++;
  }

  console.log(`Seeded ${n} templates, skipped ${skipped} protected`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
