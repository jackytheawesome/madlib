import type * as Party from "partykit/server";
import type { ClientMessage, ServerMessage } from "../src/lib/room";
import { applyRoomMessage, emptyRoomState } from "../src/lib/room-engine";
import type { RoomState } from "../src/lib/room";

/** Локальный realtime (npm run dev). На проде комнаты идут через Neon API. */
export default class RoomServer implements Party.Server {
  state: RoomState = emptyRoomState();

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

    const playerId =
      msg.type === "join" || msg.type === "submitAnswers" ? msg.playerId : this.playerIdOf(sender);

    if (!playerId) {
      this.send(sender, { type: "error", message: "Сначала войди в комнату" });
      return;
    }

    const result = applyRoomMessage(this.state, msg, {
      playerId,
      connectionId: sender.id,
    });
    this.state = result.state;
    if (!result.ok) {
      this.send(sender, { type: "error", message: result.error });
    }
    this.broadcastState();
  }

  private playerIdOf(sender: Party.Connection) {
    return this.state.players.find((p) => p.connectionId === sender.id)?.id;
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
