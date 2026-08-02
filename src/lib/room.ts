import type { Template } from "./types";

export type RoomPhase = "lobby" | "picking" | "filling" | "reveal";

export type RoomPlayer = {
  id: string;
  nickname: string;
  connectionId: string;
  isHost: boolean;
};

export type RoomState = {
  phase: RoomPhase;
  players: RoomPlayer[];
  template: Template | null;
  /** playerId -> blank ids */
  assignments: Record<string, string[]>;
  /** blankId -> answer */
  answers: Record<string, string>;
  /** playerId -> submitted */
  submitted: Record<string, boolean>;
  /** role index -> playerId (for dialogue reading hints) */
  roleToPlayer: Record<number, string>;
};

export type ClientMessage =
  | { type: "join"; playerId: string; nickname: string }
  | { type: "setPhase"; phase: "picking" | "lobby" }
  | { type: "startGame"; template: Template }
  | { type: "submitAnswers"; playerId: string; answers: Record<string, string> }
  | { type: "nextRound"; mode: "pick" | "random"; template?: Template };

export type ServerMessage =
  | { type: "state"; state: RoomState }
  | { type: "error"; message: string };
