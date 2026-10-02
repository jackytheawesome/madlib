import type { GameState, Player } from "./types";

/** Public, serializable room state. Inputs and connection credentials never live here. */
export type RoomPlayer = {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  player: Player;
  quizChoice: number | null;
  quizCorrect: boolean | null;
};

export type RoomGameState = Omit<GameState,
  "nickname" | "color" | "player" | "quizChoice" | "quizCorrect" | "lastShot" | "previousInput"
> & {
  hostId: string;
  players: Record<string, RoomPlayer>;
  quizTotal: number;
  quizCorrectCount: number;
  /** Frozen at the first fight: reconnects cannot increase or decrease boss health. */
  bossParticipantCount: number;
  bossBaseHp: number;
};
