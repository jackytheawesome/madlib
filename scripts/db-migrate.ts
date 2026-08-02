/**
 * Создаёт таблицу templates, если её ещё нет.
 * Запуск: npx tsx scripts/db-migrate.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

async function main() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }

  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id varchar(128) PRIMARY KEY,
      title text NOT NULL,
      kind varchar(32) NOT NULL,
      genre varchar(32) NOT NULL,
      size varchar(16) NOT NULL,
      player_count integer,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS templates_kind_idx ON templates (kind)`;
  await sql`CREATE INDEX IF NOT EXISTS templates_genre_idx ON templates (genre)`;
  await sql`CREATE INDEX IF NOT EXISTS templates_size_idx ON templates (size)`;

  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      code varchar(16) PRIMARY KEY,
      data jsonb NOT NULL,
      version integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log("OK: templates + rooms tables ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
