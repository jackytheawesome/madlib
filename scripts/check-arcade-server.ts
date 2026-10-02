import assert from "node:assert/strict";
import type * as Party from "partykit/server";
import ArcadeServer from "../party/arcade";
import { issueTicket, verifyTicket } from "../src/lib/arcade/auth";

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
    server.game.players[id].player.x = 350;
    server.game.players[id].player.hp = 2;
    await disconnect(guests[0]);
    const renewed = await server.onRequest(request({ action: "session", token: admissions[0].token }));
    assert.equal(renewed.status, 200);
    const reconnect = await connect(admissions[0].token);
    guests[0] = reconnect;
    check("a reconnect restores the same avatar and health during play", () => {
      assert.equal(server.game.players[id].player.x, 350); assert.equal(server.game.players[id].player.hp, 2);
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
    console.log(`Arcade server: ${checks} protocol checks passed.`);
  } finally {
    for (const connection of connections.values()) await disconnect(connection);
  }
}

main().catch(() => { console.error("Arcade server protocol check failed"); process.exitCode = 1; });
