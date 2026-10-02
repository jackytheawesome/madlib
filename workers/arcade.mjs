import ArcadeServer from "../party/arcade.ts";

const ROOM_ID = "demo";
const PARTY_NAME = "arcade";
const ROOM_PATH = `/parties/${PARTY_NAME}/${ROOM_ID}`;

function unavailable(message, status = 500) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Bridges the already-tested Party.Server protocol to a native Durable Object. */
export class ArcadeDurable {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.connections = new Map();
    const room = {
      id: ROOM_ID,
      internalID: ctx.id.toString(),
      name: PARTY_NAME,
      env,
      storage: ctx.storage,
      blockConcurrencyWhile: ctx.blockConcurrencyWhile.bind(ctx),
      getConnection: (id) => this.connections.get(id),
      getConnections: () => this.connections.values(),
      broadcast: (payload, without = []) => {
        for (const connection of this.connections.values()) {
          if (connection.readyState === 1 && !without.includes(connection.id)) connection.send(payload);
        }
      },
    };
    this.server = new ArcadeServer(room);
    ctx.blockConcurrencyWhile(() => this.server.onStart());
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== ROOM_PATH) return unavailable("Комната не найдена", 404);
    try {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return await this.server.onRequest(request);
      }
      const authorized = await ArcadeServer.onBeforeConnect(request, { id: ROOM_ID, env: this.env });
      if (authorized instanceof Response) return authorized;
      return await this.connect(authorized);
    } catch {
      // Never include request URLs or tickets in diagnostics sent to clients.
      return unavailable("Не удалось подключиться к комнате. Попробуйте ещё раз");
    }
  }

  async connect(request) {
    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];
    let identity = null;
    const connection = {
      id: crypto.randomUUID(),
      get readyState() { return serverSocket.readyState; },
      get state() { return identity; },
      setState(value) {
        identity = typeof value === "function" ? value(identity) : value;
        return identity;
      },
      send: (payload) => serverSocket.send(payload),
      close: (code, reason) => serverSocket.close(code, reason),
    };
    // The game's 60Hz simulation needs a live object; ordinary accept deliberately
    // keeps it active instead of opting into websocket hibernation.
    serverSocket.accept();
    this.connections.set(connection.id, connection);
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      this.connections.delete(connection.id);
      this.ctx.waitUntil(this.server.onClose(connection).catch(() => {}));
    };
    const fail = () => {
      try { connection.close(1011, "Соединение прервано. Подключитесь ещё раз"); } catch { /* Already closed. */ }
      remove();
    };
    serverSocket.addEventListener("message", (event) => {
      if (!removed) this.ctx.waitUntil(this.server.onMessage(event.data, connection).catch(fail));
    });
    serverSocket.addEventListener("close", remove);
    serverSocket.addEventListener("error", fail);
    try {
      await this.server.onConnect(connection, { request });
    } catch {
      fail();
    }
    return new Response(null, { status: 101, webSocket: clientSocket });
  }
}

const worker = {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== ROOM_PATH) return unavailable("Комната не найдена", 404);
    const id = env.ARCADE_ROOM.idFromName(ROOM_ID);
    return env.ARCADE_ROOM.get(id).fetch(request);
  },
};

export default worker;
