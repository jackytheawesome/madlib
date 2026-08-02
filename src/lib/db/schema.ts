import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { Template } from "@/lib/types";

export const templates = pgTable("templates", {
  id: varchar("id", { length: 128 }).primaryKey(),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  genre: varchar("genre", { length: 32 }).notNull(),
  size: varchar("size", { length: 16 }).notNull(),
  playerCount: integer("player_count"),
  /** Полный JSON шаблона */
  data: jsonb("data").$type<Template>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TemplateRow = typeof templates.$inferSelect;
