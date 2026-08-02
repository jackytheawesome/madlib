import type { TextBlank } from "./types";

/** Равномерно и случайно делит поля между игроками */
export function distributeBlanks(
  blanks: TextBlank[],
  playerIds: string[],
  rng: () => number = Math.random,
): Record<string, string[]> {
  if (playerIds.length === 0) return {};

  const shuffled = [...blanks].sort(() => rng() - 0.5);
  const result: Record<string, string[]> = Object.fromEntries(
    playerIds.map((id) => [id, [] as string[]]),
  );

  shuffled.forEach((blank, index) => {
    const playerId = playerIds[index % playerIds.length];
    result[playerId].push(blank.id);
  });

  return result;
}

export function createRoomCode(rng: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return code;
}

export function fillSegments(
  segments: { type: string; value?: string; blankId?: string }[],
  answers: Record<string, string>,
): string {
  return segments
    .map((seg) => {
      if (seg.type === "text") return seg.value ?? "";
      if (seg.type === "blank" && seg.blankId) {
        return answers[seg.blankId]?.trim() || "…";
      }
      return "";
    })
    .join("");
}
