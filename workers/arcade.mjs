import ArcadeServer from "../party/arcade.ts";

const ROOM_ID = "demo";
const PARTY_NAME = "arcade";
const ROOM_PATH = `/parties/${PARTY_NAME}/${ROOM_ID}`;

function unavailable(message, status = 500) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function frontendOrigin(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.pathname !== "/" || url.search || url.hash
      || !(url.hostname.endsWith(".vercel.app") || url.hostname === "chepuha.fun")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function frontendPath(pathname) {
  // Reject encoded path separators and nested encodings before the upstream router
  // can decode them into a path outside this narrow proxy surface.
  if (/%(?:2f|5c|25|00)/i.test(pathname)) return false;
  return pathname === "/arcade" || pathname === "/arcade/"
    || pathname === "/arcade/local" || pathname === "/arcade/local/"
    || pathname.startsWith("/_next/") || pathname.startsWith("/api/arcade/")
    || pathname === "/favicon.ico";
}

async function proxyFrontend(request, env, incoming) {
  if (!frontendPath(incoming.pathname)) return unavailable("Страница не найдена", 404);
  const origin = request.headers.get("origin");
  if (origin && origin !== incoming.origin) return unavailable("Нет доступа", 403);
  if (request.headers.has("upgrade")) return unavailable("Соединение не поддерживается", 400);
  const upstreamOrigin = frontendOrigin(env.ARCADE_FRONTEND);
  if (!upstreamOrigin) return unavailable("Страница игры ещё не настроена", 503);
  const target = new URL(incoming.pathname + incoming.search, upstreamOrigin);
  const headers = new Headers(request.headers);
  for (const name of ["host", "forwarded", "connection", "keep-alive", "proxy-connection", "transfer-encoding"]) headers.delete(name);
  headers.set("x-forwarded-host", target.host);
  headers.set("x-forwarded-proto", "https");
  const clientAddress = request.headers.get("cf-connecting-ip");
  if (clientAddress) headers.set("x-forwarded-for", clientAddress);
  else headers.delete("x-forwarded-for");
  if (origin) headers.set("origin", upstreamOrigin);
  try {
    const forwarded = new Request(target, request);
    const upstream = await fetch(new Request(forwarded, {
      headers, redirect: "manual", signal: AbortSignal.timeout(20_000),
    }));
    // Clone the response without collapsing its Set-Cookie headers. Host-only
    // session cookies will belong to the browser's Worker origin.
    const result = new Response(upstream.body, upstream);
    const location = upstream.headers.get("location");
    if (location) {
      const redirected = new URL(location, target);
      if (redirected.origin === upstreamOrigin && frontendPath(redirected.pathname)) {
        result.headers.set("location", incoming.origin + redirected.pathname + redirected.search + redirected.hash);
      }
    }
    return result;
  } catch {
    return unavailable("Страница игры временно недоступна. Попробуйте ещё раз", 503);
  }
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
    const incoming = new URL(request.url);
    if (incoming.pathname === ROOM_PATH) {
      const id = env.ARCADE_ROOM.idFromName(ROOM_ID);
      return env.ARCADE_ROOM.get(id).fetch(request);
    }
    if (incoming.pathname === "/") return Response.redirect("https://chepuha.fun", 302);
    return proxyFrontend(request, env, incoming);
  },
};

export default worker;
