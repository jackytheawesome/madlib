import assert from "node:assert/strict";
import type * as Party from "partykit/server";
import ArcadeServer from "../party/arcade";
import { issueTicket, verifyTicket } from "../src/lib/arcade/auth";
import { addRoomPlayer, TASK_EXIT } from "../src/lib/arcade/room-engine";
import type { RoomGameState } from "../src/lib/arcade/room-types";
import { STATIONS } from "../src/lib/arcade/types";

const secret = crypto.randomUUID() + crypto.randomUUID();
const password = crypto.randomUUID();
const rotatedPassword = crypto.randomUUID();
const records = new Map<string, unknown>();
const connections = new Map<string, FakeConnection>();
let checks = 0;
const check = (label: string, action: () => void) => { action(); checks++; console.log(`✓ ${label}`); };

class FakeConnection {
  id = crypto.randomUUID();
  readyState = 1;
  state: unknown = null;
  messages: Array<Record<string, unknown>> = [];
  closedCode: number | null = null;
  setState(value: unknown) { this.state = value; return value; }
  send(payload: string) { this.messages.push(JSON.parse(payload)); }
  close(code: number) { this.closedCode = code; this.readyState = 3; }
}

const room = {
  id: "demo", env: { ARCADE_SECRET: secret },
  storage: {
    get: async (key: string) => structuredClone(records.get(key)),
    put: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
  },
  getConnections: () => connections.values(),
} as unknown as Party.Room;
const server = new ArcadeServer(room);
type ServerConnection = Parameters<ArcadeServer["onMessage"]>[1];
const endpoint = "https://arcade.example/parties/arcade/demo";
function request(body: unknown, authenticated = true) {
  return new Request(endpoint, {
    method: "POST",
    headers: authenticated ? { Authorization: `Bearer ${secret}`, "x-arcade-client": "test-client" } : {},
    body: JSON.stringify(body),
  }) as unknown as Party.Request;
}
const command = (connection: FakeConnection, message: unknown) => server.onMessage(JSON.stringify(message), connection as unknown as ServerConnection);
async function connect(token: string) {
  const connection = new FakeConnection();
  connections.set(connection.id, connection);
  await server.onConnect(connection as unknown as ServerConnection, {
    request: new Request(`${endpoint}?token=${encodeURIComponent(token)}`),
  } as unknown as Party.ConnectionContext);
  return connection;
}
async function disconnect(connection: FakeConnection) {
  connection.close(1000);
  await server.onClose(connection as unknown as ServerConnection);
}

async function main() {
  await server.onStart();
  const publicStatus = await (await server.onRequest(new Request(endpoint) as unknown as Party.Request)).json();
  check("public status starts closed and reveals no password or game snapshot", () => {
    assert.deepEqual(publicStatus, { open: false, hostOnline: false, phase: "closed", count: 0, limit: 4 });
  });
  const unsigned = await server.onRequest(request({ action: "host", nickname: "Хост", color: "#abcdef" }, false));
  check("unsigned admission requests are rejected", () => assert.equal(unsigned.status, 401));
  const hostAdmission = await (await server.onRequest(request({ action: "host", nickname: "Хост", color: "#abcdef" }))).json() as { token: string; playerId: string };
  const hostTicket = await verifyTicket(secret, hostAdmission.token);
  check("host admission is signed and never assigned to a guest", () => {
    assert.equal(hostTicket?.role, "host"); assert.equal(hostTicket?.playerId, "host");
  });
  const tampered = `${hostAdmission.token.slice(0, -5)}xxxxx`;
  const tamperedTicket = await verifyTicket(secret, tampered);
  const expired = await issueTicket(secret, { playerId: "guest", role: "guest", nickname: "Гость", color: "#abcdef", epoch: 0 }, -1);
  const expiredTicket = await verifyTicket(secret, expired);
  check("tampered and expired tickets are rejected", () => {
    assert.equal(tamperedTicket, null); assert.equal(expiredTicket, null);
  });
  const denied = await ArcadeServer.onBeforeConnect(new Request(endpoint) as unknown as Party.Request, { id: "demo", env: room.env } as unknown as Party.Lobby);
  check("websocket upgrade without a ticket is rejected", () => assert.ok(denied instanceof Response && denied.status === 401));

  let host = await connect(hostAdmission.token);
  const guests: FakeConnection[] = [];
  try {
    check("host connects to a closed room without opening it", () => { assert.equal(host.closedCode, null); assert.equal(server.open, false); });
    await command(host, { type: "room", action: "open", password });
    check("host opens a fresh lobby with a password", () => { assert.equal(server.open, true); assert.equal(server.game.phase, "lobby"); });
    assert.equal((await server.onRequest(request({ action: "join", nickname: "Гость", color: "#fedcba", password: "wrong-password" }))).status, 403);
    const admissions: Array<{ token: string; playerId: string }> = [];
    for (let index = 0; index < 3; index++) {
      const joined = await server.onRequest(request({ action: "join", nickname: `Игрок ${index}`, color: "#fedcba", password }));
      assert.equal(joined.status, 200);
      admissions.push(await joined.json() as { token: string; playerId: string });
    }
    const overflow = await server.onRequest(request({ action: "join", nickname: "Пятый", color: "#fedcba", password }));
    check("admission reserves slots before sockets connect; total limit includes host", () => assert.equal(overflow.status, 409));
    for (const admission of admissions) guests.push(await connect(admission.token));
    check("all four players receive one authoritative room state", () => {
      assert.equal(Object.keys(server.game.players).length, 4);
      assert.ok(guests.every((guest) => guest.closedCode === null && guest.messages.some((message) => message.type === "state")));
    });
    await command(guests[0], { type: "command", command: "start" });
    await command(guests[0], { type: "room", action: "close" });
    check("guests cannot start or close the event", () => { assert.equal(server.game.phase, "lobby"); assert.equal(server.open, true); });
    await command(host, { type: "command", command: "start" });
    assert.equal(server.game.phase, "task");
    const late = await server.onRequest(request({ action: "join", nickname: "Поздний", color: "#fedcba", password }));
    check("new players are blocked after the game starts", () => assert.equal(late.status, 409));
    const id = admissions[0].playerId;
    Object.assign(server.game.players[id].player, { x: STATIONS[1].x, y: STATIONS[1].y + STATIONS[1].height - 46 });
    await command(guests[0], { type: "interact", station: "save" });
    assert.equal(server.game.players[id].taskStep, 0);
    Object.assign(server.game.players[id].player, { x: STATIONS[0].x, y: STATIONS[0].y + STATIONS[0].height - 46 });
    await command(guests[0], { type: "interact", station: "heading" });
    assert.equal(server.game.players[id].taskStep, 1);
    Object.assign(server.game.players[id].player, { x: TASK_EXIT.x, y: 564, grounded: true });
    await command(guests[0], { type: "interact", station: "exit" });
    assert.equal(server.game.players[id].taskExited, false);
    Object.assign(server.game.players[id].player, { x: STATIONS[1].x, y: STATIONS[1].y + STATIONS[1].height - 46 });
    await command(guests[0], { type: "interact", station: "save" });
    assert.equal(server.game.players[id].taskStep, 2);
    await command(guests[0], { type: "interact", station: "exit" });
    assert.equal(server.game.players[id].taskExited, false);
    Object.assign(server.game.players[id].player, { x: TASK_EXIT.x, y: 564, grounded: true });
    await command(guests[0], { type: "interact", station: "exit" });
    check("the protocol validates each player's task order and personal floor exit", () => {
      assert.equal(server.game.players[id].taskExited, true);
      assert.equal(server.game.players.host.taskStep, 0);
      assert.equal(server.game.phase, "task");
    });
    server.game.players[id].player.x = 350;
    server.game.players[id].player.hp = 2;
    await disconnect(guests[0]);
    const renewed = await server.onRequest(request({ action: "session", token: admissions[0].token }));
    assert.equal(renewed.status, 200);
    const reconnect = await connect(admissions[0].token);
    guests[0] = reconnect;
    check("a reconnect restores the same avatar and health during play", () => {
      assert.equal(server.game.players[id].player.x, 350); assert.equal(server.game.players[id].player.hp, 2);
      assert.equal(server.game.players[id].taskStep, 2); assert.equal(server.game.players[id].taskExited, true);
    });
    await disconnect(host);
    const absent = await server.onRequest(request({ action: "join", nickname: "Гость", color: "#fedcba", password }));
    check("host departure pauses simulation and blocks entry", () => { assert.equal(server.game.paused, true); assert.equal(absent.status, 403); });
    await disconnect(guests[0]);
    const waitingSession = await server.onRequest(request({ action: "session", token: admissions[0].token }));
    const waitingGuest = await connect(admissions[0].token);
    check("host absence preserves guest admission and temporarily defers its websocket", () => {
      assert.equal(waitingSession.status, 200); assert.equal(waitingGuest.closedCode, 4005);
      assert.equal(server.game.players[id].player.hp, 2);
    });
    host = await connect(hostAdmission.token);
    guests[0] = await connect(admissions[0].token);
    check("both players can return without losing the avatar or automatically resuming", () => {
      assert.equal(guests[0].closedCode, null); assert.equal(server.game.players[id].connected, true);
      assert.equal(server.game.players[id].player.hp, 2); assert.equal(server.game.paused, true);
    });
    await command(host, { type: "command", command: "restart" });
    await command(host, { type: "room", action: "password", password: rotatedPassword });
    const oldSession = await server.onRequest(request({ action: "session", token: admissions[0].token }));
    check("password rotation revokes guest sessions and resets the roster", () => {
      assert.equal(oldSession.status, 401); assert.equal(Object.keys(server.game.players).length, 1);
      assert.equal(guests[0].closedCode, 4003);
    });
    await command(host, { type: "room", action: "close" });
    const reloaded = new ArcadeServer(room);
    await reloaded.onStart();
    check("manual closure is persisted across server restarts", () => { assert.equal(reloaded.open, false); assert.equal(reloaded.game.phase, "closed"); });
    const oldRoom = structuredClone(records.get("arcade-room-v1")) as { game: RoomGameState; open: boolean };
    oldRoom.open = true;
    oldRoom.game.phase = "task";
    oldRoom.game.taskStep = 1;
    addRoomPlayer(oldRoom.game, "offline", "Вернусь", "#fedcba");
    for (const member of Object.values(oldRoom.game.players)) {
      const oldMember = member as unknown as Record<string, unknown>;
      delete oldMember.taskStep;
      delete oldMember.taskExited;
    }
    const migrationRoom = { ...room, storage: { get: async () => structuredClone(oldRoom), put: async () => {} } } as unknown as Party.Room;
    const migrated = new ArcadeServer(migrationRoom);
    await migrated.onStart();
    check("persisted shared-task rooms migrate without deleting participants or completing on restart", () => {
      assert.equal(migrated.game.phase, "task"); assert.equal(migrated.game.paused, true);
      assert.equal(Object.keys(migrated.game.players).length, 2);
      assert.ok(Object.values(migrated.game.players).every((member) => !member.connected && member.taskStep === 1 && !member.taskExited));
    });
    console.log(`Arcade server: ${checks} protocol checks passed.`);
  } finally {
    for (const connection of connections.values()) await disconnect(connection);
  }
}

main().catch(() => { console.error("Arcade server protocol check failed"); process.exitCode = 1; });
