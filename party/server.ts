import type * as Party from "partykit/server";
import type { ClientMessage, RoomPlayer, RoomState, ServerMessage } from "../src/lib/room";

const MAX_PLAYERS = 4;

function emptyState(): RoomState {
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

export default class RoomServer implements Party.Server {
  state: RoomState = emptyState();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    this.send(conn, { type: "state", state: this.state });
  }

  onClose(conn: Party.Connection) {
    const before = this.state.players.length;
    this.state.players = this.state.players.filter((p) => p.connectionId !== conn.id);
    if (this.state.players.length === before) return;

    if (this.state.players.length > 0 && !this.state.players.some((p) => p.isHost)) {
      this.state.players[0].isHost = true;
    }

    if (this.state.phase !== "lobby" && this.state.phase !== "picking") {
      // mid-game disconnect: return to lobby to avoid soft-lock
      this.state.phase = "lobby";
      this.state.template = null;
      this.state.assignments = {};
      this.state.answers = {};
      this.state.submitted = {};
      this.state.roleToPlayer = {};
    }

    this.broadcastState();
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      this.send(sender, { type: "error", message: "Некорректное сообщение" });
      return;
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(msg, sender);
        break;
      case "setPhase":
        this.handleSetPhase(msg, sender);
        break;
      case "startGame":
        this.handleStart(msg, sender);
        break;
      case "submitAnswers":
        this.handleSubmit(msg, sender);
        break;
      case "nextRound":
        this.handleNext(msg, sender);
        break;
      default:
        this.send(sender, { type: "error", message: "Неизвестная команда" });
    }
  }

  private handleJoin(
    msg: Extract<ClientMessage, { type: "join" }>,
    sender: Party.Connection,
  ) {
    const nickname = msg.nickname.trim().slice(0, 24);
    if (!nickname) {
      this.send(sender, { type: "error", message: "Нужен ник" });
      return;
    }

    const existing = this.state.players.find((p) => p.id === msg.playerId);
    if (existing) {
      existing.connectionId = sender.id;
      existing.nickname = nickname;
      this.broadcastState();
      return;
    }

    if (this.state.players.length >= MAX_PLAYERS) {
      this.send(sender, { type: "error", message: "Комната заполнена (макс. 4)" });
      return;
    }

    if (this.state.phase !== "lobby" && this.state.phase !== "picking") {
      this.send(sender, { type: "error", message: "Игра уже идёт" });
      return;
    }

    const isHost = this.state.players.length === 0;
    this.state.players.push({
      id: msg.playerId,
      nickname,
      connectionId: sender.id,
      isHost,
    });
    this.broadcastState();
  }

  private requireHost(sender: Party.Connection): RoomPlayer | null {
    const player = this.state.players.find((p) => p.connectionId === sender.id);
    if (!player?.isHost) {
      this.send(sender, { type: "error", message: "Только хост может это сделать" });
      return null;
    }
    return player;
  }

  private handleSetPhase(
    msg: Extract<ClientMessage, { type: "setPhase" }>,
    sender: Party.Connection,
  ) {
    if (!this.requireHost(sender)) return;
    if (msg.phase === "picking" || msg.phase === "lobby") {
      this.state.phase = msg.phase;
      if (msg.phase === "lobby") {
        this.state.template = null;
        this.state.assignments = {};
        this.state.answers = {};
        this.state.submitted = {};
        this.state.roleToPlayer = {};
      }
      this.broadcastState();
    }
  }

  private handleStart(
    msg: Extract<ClientMessage, { type: "startGame" }>,
    sender: Party.Connection,
  ) {
    if (!this.requireHost(sender)) return;
    const tpl = msg.template;
    const count = this.state.players.length;
    if (count < 1) {
      this.send(sender, { type: "error", message: "Нет игроков" });
      return;
    }
    if (tpl.kind === "dialogue" && tpl.playerCount !== count) {
      this.send(sender, {
        type: "error",
        message: `Этот диалог только для ${tpl.playerCount} игроков`,
      });
      return;
    }

    const playerIds = this.state.players.map((p) => p.id);
    this.state.template = tpl;
    this.state.assignments = distributeBlanks(
      tpl.blanks.map((b) => b.id),
      playerIds,
    );
    this.state.answers = {};
    this.state.submitted = Object.fromEntries(playerIds.map((id) => [id, false]));
    this.state.roleToPlayer =
      tpl.kind === "dialogue" ? assignRoles(tpl.playerCount, this.state.players) : {};
    this.state.phase = "filling";
    this.broadcastState();
  }

  private handleSubmit(
    msg: Extract<ClientMessage, { type: "submitAnswers" }>,
    sender: Party.Connection,
  ) {
    const player = this.state.players.find((p) => p.connectionId === sender.id);
    if (!player || player.id !== msg.playerId) {
      this.send(sender, { type: "error", message: "Игрок не найден" });
      return;
    }
    if (this.state.phase !== "filling") return;

    const allowed = new Set(this.state.assignments[player.id] ?? []);
    for (const [blankId, value] of Object.entries(msg.answers)) {
      if (allowed.has(blankId)) {
        this.state.answers[blankId] = value.trim() || "???";
      }
    }
    this.state.submitted[player.id] = true;

    const allDone = this.state.players.every((p) => this.state.submitted[p.id]);
    if (allDone) {
      this.state.phase = "reveal";
    }
    this.broadcastState();
  }

  private handleNext(
    msg: Extract<ClientMessage, { type: "nextRound" }>,
    sender: Party.Connection,
  ) {
    if (!this.requireHost(sender)) return;
    if (msg.mode === "pick") {
      this.state.phase = "picking";
      this.state.template = null;
      this.state.assignments = {};
      this.state.answers = {};
      this.state.submitted = {};
      this.state.roleToPlayer = {};
      this.broadcastState();
      return;
    }
    if (msg.mode === "random" && msg.template) {
      this.handleStart({ type: "startGame", template: msg.template }, sender);
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcastState() {
    const payload = JSON.stringify({ type: "state", state: this.state } satisfies ServerMessage);
    for (const conn of this.room.getConnections()) {
      conn.send(payload);
    }
  }
}

RoomServer satisfies Party.Worker;
