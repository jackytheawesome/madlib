import { NextResponse } from "next/server";
import { filterTemplates, loadAllTemplates } from "@/lib/content";
import type { GenreId, TextKind, TextSize } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") as TextKind | null;
  const genre = searchParams.get("genre") as GenreId | null;
  const size = searchParams.get("size") as TextSize | null;
  const playerCountRaw = searchParams.get("playerCount");
  const playerCount = playerCountRaw ? Number(playerCountRaw) : undefined;

  const all = await loadAllTemplates();
  const templates = filterTemplates(all, {
    kind: kind ?? undefined,
    genre: genre ?? undefined,
    size: size ?? undefined,
    playerCount,
  });

  return NextResponse.json({ templates });
}
