import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function connectionString() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    throw new Error("DATABASE_URL / POSTGRES_URL не задан");
  }
  return url;
}

export function getDb() {
  const sql = neon(connectionString());
  return drizzle(sql, { schema });
}
