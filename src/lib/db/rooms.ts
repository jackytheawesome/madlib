import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb } from "./index";
import { rooms } from "./schema";
import type { ClientMessage, RoomState } from "@/lib/room";
import {
  applyRoomMessage,
  emptyRoomState,
  pruneStalePlayers,
  touchPlayer,
} from "@/lib/room-engine";

function dbUrl() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("DATABASE_URL / POSTGRES_URL не задан");
  return url;
}

export async function ensureRoom(code: string): Promise<{
  state: RoomState;
  version: number;
}> {
  const db = getDb();
  const normalized = code.toUpperCase();
  const existing = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  if (existing[0]) {
    return { state: existing[0].data, version: existing[0].version };
  }
  const state = emptyRoomState();
  await db.insert(rooms).values({
    code: normalized,
    data: state,
    version: 0,
    updatedAt: new Date(),
  });
  return { state, version: 0 };
}

async function compareAndSet(
  code: string,
  expectedVersion: number,
  state: RoomState,
): Promise<boolean> {
  const sql = neon(dbUrl());
  const rows = await sql`
    UPDATE rooms
    SET data = ${JSON.stringify(state)}::jsonb,
        version = ${expectedVersion + 1},
        updated_at = now()
    WHERE code = ${code} AND version = ${expectedVersion}
    RETURNING version
  `;
  return rows.length > 0;
}

/** Оптимистичная мутация с ретраями. */
export async function mutateRoom(
  code: string,
  mutator: (state: RoomState) => { state: RoomState; error?: string },
): Promise<{ state: RoomState; error?: string }> {
  const normalized = code.toUpperCase();

  for (let attempt = 0; attempt < 8; attempt++) {
    const { state, version } = await ensureRoom(normalized);
    const result = mutator(pruneStalePlayers(state));
    const ok = await compareAndSet(normalized, version, result.state);
    if (ok) return { state: result.state, error: result.error };
  }
  return { state: emptyRoomState(), error: "Комната занята, попробуй ещё раз" };
}

export async function getRoomState(code: string, playerId?: string): Promise<RoomState> {
  const result = await mutateRoom(code, (state) => {
    let next = pruneStalePlayers(state);
    if (playerId) next = touchPlayer(next, playerId);
    return { state: next };
  });
  return result.state;
}

export async function handleRoomMessage(
  code: string,
  msg: ClientMessage,
  playerId: string,
): Promise<{ state: RoomState; error?: string }> {
  return mutateRoom(code, (state) => {
    const result = applyRoomMessage(state, msg, {
      playerId,
      connectionId: playerId,
    });
    if (!result.ok) return { state: result.state, error: result.error };
    return { state: result.state };
  });
}
