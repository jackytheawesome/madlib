import { readFile, writeFile } from "node:fs/promises";

class HostSmokeFailure extends Error {}
const requireCheck = (condition, message) => { if (!condition) throw new HostSmokeFailure(message); };
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (response.status < 500 || attempt === 2) return response;
      await response.body?.cancel().catch(() => {});
    } catch {
      if (attempt === 2) throw new HostSmokeFailure("Host smoke: сеть не ответила при проверке.");
    }
    await delay(500);
  }
}

async function jsonResponse(response, label) {
  requireCheck(response.status === 200, `Host smoke: ${label} — HTTP ${response.status}.`);
  try { return await response.json(); } catch { throw new HostSmokeFailure(`Host smoke: ${label} — некорректный ответ.`); }
}

function rememberCookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const value = cookie.split(";", 1)[0];
    const separator = value.indexOf("=");
    if (separator > 0) jar.set(value.slice(0, separator), value.slice(separator + 1));
  }
}

function cookieHeader(jar) {
  return ["arcade_host_access", "arcade_host"].filter((name) => jar.has(name)).map((name) => `${name}=${jar.get(name)}`).join("; ");
}

function connectHost(backend, session) {
  const socketUrl = new URL(backend);
  socketUrl.protocol = "wss:";
  socketUrl.searchParams.set("token", session.token);
  const socket = new WebSocket(socketUrl);
  const connected = new Promise((resolve, reject) => {
    let welcomed = false;
    let authoritative = false;
    const timer = setTimeout(() => fail(), 10_000);
    const fail = () => {
      cleanup();
      reject(new HostSmokeFailure("Host smoke: сервер не подтвердил подключение ведущей."));
    };
    const receive = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "error") { fail(); return; }
        if (message.type === "welcome") welcomed = message.playerId === session.playerId && message.role === "host";
        if (message.type === "state") {
          authoritative = message.room?.open === false && message.room?.hostOnline === true
            && message.state?.phase === "closed" && message.state?.players?.[session.playerId]?.connected === true;
        }
        if (welcomed && authoritative) { cleanup(); resolve(); }
      } catch { fail(); }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("message", receive);
      socket.removeEventListener("error", fail);
      socket.removeEventListener("close", fail);
    };
    socket.addEventListener("message", receive);
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
  });
  return { socket, connected };
}

async function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const done = () => { clearTimeout(timer); socket.removeEventListener("close", done); resolve(); };
    const timer = setTimeout(done, 3000);
    socket.addEventListener("close", done);
    try { socket.close(1000, "Smoke check complete"); } catch { done(); }
  });
}

async function waitClosed(backend) {
  const deadline = Date.now() + 10_000;
  do {
    const status = await jsonResponse(await request(backend), "заключительный статус комнаты");
    requireCheck(status.open === false && status.phase === "closed", "Host smoke: комната неожиданно открылась.");
    if (status.hostOnline === false) return;
    await delay(250);
  } while (Date.now() < deadline);
  throw new HostSmokeFailure("Host smoke: ведущая не отключилась после проверки.");
}

async function main() {
  const hostPassword = process.env.ARCADE_HOST_PASSWORD || process.env.ADMIN_PASSWORD;
  requireCheck(typeof hostPassword === "string" && hostPassword.length > 0, "Host smoke: пароль ведущей не задан в окружении.");
  let release;
  try { release = JSON.parse(await readFile(new URL("../docs/ARCADE_RELEASE.json", import.meta.url), "utf8")); }
  catch { throw new HostSmokeFailure("Host smoke: нет проверенного файла выпуска."); }
  requireCheck(release.status === "READY" && release.room === "closed", "Host smoke: выпуск не готов или комната не закрыта.");
  let frontend, backend;
  try {
    frontend = new URL(release.gameUrl);
    backend = new URL(release.backend);
  } catch { throw new HostSmokeFailure("Host smoke: некорректные адреса выпуска."); }
  requireCheck(frontend.protocol === "https:" && backend.protocol === "https:"
    && !frontend.username && !frontend.password && !backend.username && !backend.password
    && frontend.pathname === "/arcade" && backend.pathname === "/parties/arcade/demo"
    && !backend.search && !backend.hash, "Host smoke: адреса выпуска не соответствуют демо.");
  const origin = frontend.origin;
  const initial = await jsonResponse(await request(backend), "начальный статус комнаты");
  requireCheck(initial.open === false && initial.hostOnline === false && initial.phase === "closed", "Host smoke: сначала закройте репетицию и отключите ведущую.");
  let socket;
  try {
    const jar = new Map();
    const login = await request(`${origin}/api/arcade/host-login`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ password: hostPassword }),
    });
    await jsonResponse(login, "вход ведущей");
    rememberCookies(login, jar);
    requireCheck(jar.has("arcade_host_access"), "Host smoke: вход не установил cookie ведущей.");
    const admission = await request(`${origin}/api/arcade/session`, {
      method: "POST", headers: { Origin: origin, Cookie: cookieHeader(jar), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "host", nickname: "Проверка ведущей", color: "#a899ff" }),
    });
    const session = await jsonResponse(admission, "получение host session");
    rememberCookies(admission, jar);
    requireCheck(session.role === "host" && session.playerId === "host" && typeof session.token === "string" && jar.has("arcade_host"), "Host smoke: ведущая не получила host session и cookie.");
    const restored = await jsonResponse(await request(`${origin}/api/arcade/session?role=host`, { headers: { Cookie: cookieHeader(jar) } }), "восстановление host session");
    requireCheck(restored.role === "host" && restored.playerId === session.playerId && typeof restored.token === "string", "Host smoke: восстановление изменило личность ведущей.");
    const connection = connectHost(backend, restored);
    socket = connection.socket;
    await connection.connected;
  } finally {
    await closeSocket(socket);
    await waitClosed(backend);
  }
  await writeFile(new URL("../docs/ARCADE_RELEASE.json", import.meta.url), `${JSON.stringify({ ...release, hostLoginCheck: "passed", hostLoginCheckedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log("Host smoke passed: login, cookies, session restoration and authoritative WebSocket connection; room remains closed and host offline.");
}

main().catch((error) => {
  console.error(error instanceof HostSmokeFailure ? error.message : "Host smoke: проверка не завершилась.");
  process.exitCode = 1;
});
