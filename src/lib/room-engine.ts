import type { Template } from "./types";
import type { ClientMessage, RoomPlayer, RoomState } from "./room";

export const MAX_PLAYERS = 4;
export const PLAYER_STALE_MS = 45_000;

export function emptyRoomState(): RoomState {
  return {
    phase: "lobby",
    players: [],
    template: null,
    assignments: {},
    answers: {},
    submitted: {},
    roleToPlayer: {},
  };
}

function distributeBlanks(blankIds: string[], playerIds: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = Object.fromEntries(
    playerIds.map((id) => [id, [] as string[]]),
  );
  const shuffled = [...blankIds].sort(() => Math.random() - 0.5);
  shuffled.forEach((blankId, index) => {
    const playerId = playerIds[index % playerIds.length];
    result[playerId].push(blankId);
  });
  return result;
}

function assignRoles(playerCount: number, players: RoomPlayer[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (let i = 0; i < playerCount; i++) {
    map[i] = players[i % players.length]?.id ?? "";
  }
  return map;
}

export function pruneStalePlayers(state: RoomState, now = Date.now()): RoomState {
  const alive = state.players.filter(
    (p) => !p.lastSeenAt || now - p.lastSeenAt < PLAYER_STALE_MS,
  );
  if (alive.length === state.players.length) return state;

  const next: RoomState = { ...state, players: alive.map((p) => ({ ...p })) };
  if (next.players.length > 0 && !next.players.some((p) => p.isHost)) {
    next.players[0] = { ...next.players[0], isHost: true };
  }
  if (next.phase !== "lobby" && next.phase !== "picking") {
    next.phase = "lobby";
    next.template = null;
    next.assignments = {};
    next.answers = {};
    next.submitted = {};
    next.roleToPlayer = {};
  }
  return next;
}

export function touchPlayer(state: RoomState, playerId: string, now = Date.now()): RoomState {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return state;
  const players = state.players.map((p, i) =>
    i === idx ? { ...p, lastSeenAt: now } : p,
  );
  return { ...state, players };
}

export type ApplyResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: string; state: RoomState };

/** Применить клиентское сообщение к состоянию комнаты. */
export function applyRoomMessage(
  state: RoomState,
  msg: ClientMessage,
  sender: { playerId: string; connectionId: string },
  now = Date.now(),
): ApplyResult {
  let current = pruneStalePlayers(state, now);

  switch (msg.type) {
    case "join": {
      const nickname = msg.nickname.trim().slice(0, 24);
      if (!nickname) return { ok: false, error: "Нужен ник", state: current };

      const existing = current.players.find((p) => p.id === msg.playerId);
      if (existing) {
        const players = current.players.map((p) =>
          p.id === msg.playerId
            ? {
                ...p,
                connectionId: sender.connectionId,
                nickname,
                lastSeenAt: now,
              }
            : p,
        );
        return { ok: true, state: { ...current, players } };
      }

      if (current.players.length >= MAX_PLAYERS) {
        return { ok: false, error: "Комната заполнена (макс. 4)", state: current };
      }
      if (current.phase !== "lobby" && current.phase !== "picking") {
        return { ok: false, error: "Игра уже идёт", state: current };
      }

      const isHost = current.players.length === 0;
      const player: RoomPlayer = {
        id: msg.playerId,
        nickname,
        connectionId: sender.connectionId,
        isHost,
        lastSeenAt: now,
      };
      return { ok: true, state: { ...current, players: [...current.players, player] } };
    }

    case "setPhase": {
      const host = requireHost(current, sender.playerId);
      if (!host.ok) return { ...host, state: current };
      if (msg.phase !== "picking" && msg.phase !== "lobby") {
        return { ok: false, error: "Некорректная фаза", state: current };
      }
      current = touchPlayer(current, sender.playerId, now);
      if (msg.phase === "lobby") {
        return {
          ok: true,
          state: {
            ...current,
            phase: "lobby",
            template: null,
            assignments: {},
            answers: {},
            submitted: {},
            roleToPlayer: {},
          },
        };
      }
      return { ok: true, state: { ...current, phase: "picking" } };
    }

    case "startGame": {
      const host = requireHost(current, sender.playerId);
      if (!host.ok) return { ...host, state: current };
      current = touchPlayer(current, sender.playerId, now);
      return startGame(current, msg.template);
    }

    case "submitAnswers": {
      const player = current.players.find((p) => p.id === sender.playerId);
      if (!player || player.id !== msg.playerId) {
        return { ok: false, error: "Игрок не найден", state: current };
      }
      if (current.phase !== "filling") return { ok: true, state: current };

      current = touchPlayer(current, sender.playerId, now);
      const allowed = new Set(current.assignments[player.id] ?? []);
      const answers = { ...current.answers };
      for (const [blankId, value] of Object.entries(msg.answers)) {
        if (allowed.has(blankId)) {
          answers[blankId] = value.trim() || "???";
        }
      }
      const submitted = { ...current.submitted, [player.id]: true };
      const allDone = current.players.every((p) => submitted[p.id]);
      return {
        ok: true,
        state: {
          ...current,
          answers,
          submitted,
          phase: allDone ? "reveal" : current.phase,
        },
      };
    }

    case "nextRound": {
      const host = requireHost(current, sender.playerId);
      if (!host.ok) return { ...host, state: current };
      current = touchPlayer(current, sender.playerId, now);
      if (msg.mode === "pick") {
        return {
          ok: true,
          state: {
            ...current,
            phase: "picking",
            template: null,
            assignments: {},
            answers: {},
            submitted: {},
            roleToPlayer: {},
          },
        };
      }
      if (msg.mode === "random" && msg.template) {
        return startGame(current, msg.template);
      }
      return { ok: false, error: "Нужен шаблон", state: current };
    }

    default:
      return { ok: false, error: "Неизвестная команда", state: current };
  }
}

function requireHost(
  state: RoomState,
  playerId: string,
): { ok: true } | { ok: false; error: string } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.isHost) return { ok: false, error: "Только хост может это сделать" };
  return { ok: true };
}

function startGame(state: RoomState, tpl: Template): ApplyResult {
  const count = state.players.length;
  if (count < 1) return { ok: false, error: "Нет игроков", state };
  if (tpl.kind === "dialogue" && tpl.playerCount !== count) {
    return {
      ok: false,
      error: `Этот диалог только для ${tpl.playerCount} игроков`,
      state,
    };
  }

  const playerIds = state.players.map((p) => p.id);
  return {
    ok: true,
    state: {
      ...state,
      template: tpl,
      assignments: distributeBlanks(
        tpl.blanks.map((b) => b.id),
        playerIds,
      ),
      answers: {},
      submitted: Object.fromEntries(playerIds.map((id) => [id, false])),
      roleToPlayer:
        tpl.kind === "dialogue" ? assignRoles(tpl.playerCount, state.players) : {},
      phase: "filling",
    },
  };
}
