import { NextResponse } from "next/server";
import type { ClientMessage } from "@/lib/room";
import { getRoomState, handleRoomMessage } from "@/lib/db/rooms";

type Params = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { code } = await params;
    const playerId = new URL(req.url).searchParams.get("playerId") ?? undefined;
    const state = await getRoomState(code, playerId || undefined);
    return NextResponse.json({ state });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Не удалось загрузить комнату" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = (await req.json()) as { message?: ClientMessage; playerId?: string };
    if (!body.message || !body.playerId) {
      return NextResponse.json({ error: "Нужны message и playerId" }, { status: 400 });
    }
    const playerId =
      body.message.type === "join" || body.message.type === "submitAnswers"
        ? body.message.playerId
        : body.playerId;
    if (playerId !== body.playerId) {
      return NextResponse.json({ error: "playerId не совпадает" }, { status: 400 });
    }
    const result = await handleRoomMessage(code, body.message, body.playerId);
    if (result.error) {
      return NextResponse.json({ state: result.state, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ state: result.state });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Не удалось обновить комнату" }, { status: 500 });
  }
}
