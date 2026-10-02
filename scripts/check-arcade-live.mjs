import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const empty = { left: false, right: false, jump: false, interact: false, shoot: false };

/** The existing default party remains available alongside the isolated arcade party. */
export async function checkLegacyParty(backend) {
  const origin = new URL(backend).origin.replace(/^http/, "ws");
  const socket = new WebSocket(`${origin}/parties/main/arcade-smoke-${randomBytes(8).toString("hex")}`);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Прежний маршрут PartyKit не подтвердил готовность")), 10_000);
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Прежний маршрут PartyKit недоступен")); }, { once: true });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          assert.equal(message.type, "state");
          assert.ok(Array.isArray(message.state.players));
          clearTimeout(timer); resolve();
        } catch { clearTimeout(timer); reject(new Error("Прежний маршрут PartyKit вернул неожиданное состояние")); }
      }, { once: true });
    });
    console.log("✓ прежний маршрут PartyKit main работает отдельно от аркады");
  } finally { socket.close(); }
}

class PlayerClient {
  state = null;
  room = null;
  sequence = 0;
  input = { ...empty };
  listeners = new Set();
  closed = null;

  constructor(backend, admission) {
    this.admission = admission;
    const url = new URL(backend.replace(/^http/, "ws"));
    url.searchParams.set("token", admission.token);
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "state") { this.state = message.state; this.room = message.room; }
      for (const listener of this.listeners) listener(message);
    });
    this.socket.addEventListener("close", (event) => { this.closed = event.code; });
    this.socket.addEventListener("error", () => { /* The wait below reports a safe, credential-free failure. */ });
    this.heartbeat = setInterval(() => this.sendInput(), 100);
  }

  send(message) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  sendInput() { this.send({ type: "input", input: this.input, sequence: ++this.sequence }); }
  controls(changes = {}) { this.input = { ...empty, ...changes }; this.sendInput(); }
  command(command) { this.controls(); this.send({ type: "command", command }); }

  wait(predicate, timeout = 12_000) {
    if (this.state && predicate(this.state, this.room)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error("Не дождалась ожидаемого состояния комнаты")); }, timeout);
      const listener = (message) => {
        if (message.type === "state" && predicate(message.state, message.room)) {
          clearTimeout(timer); this.listeners.delete(listener); resolve(message.state);
        }
      };
      this.listeners.add(listener);
    });
  }

  nextState() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error("Снимки комнаты перестали поступать")); }, 5000);
      const listener = (message) => {
        if (message.type === "state") { clearTimeout(timer); this.listeners.delete(listener); resolve(message.state); }
      };
      this.listeners.add(listener);
    });
  }

  waitClosed(code, timeout = 5000) {
    if (this.closed !== null) return Promise.resolve(this.closed).then((actual) => assert.equal(actual, code));
    return new Promise((resolve, reject) => {
      const closed = (event) => {
        clearTimeout(timer); this.socket.removeEventListener("close", closed);
        if (event.code === code) resolve();
        else reject(new Error(`Соединение закрыто с неожиданным кодом ${event.code}`));
      };
      const timer = setTimeout(() => { this.socket.removeEventListener("close", closed); reject(new Error("Не дождалась закрытия соединения")); }, timeout);
      this.socket.addEventListener("close", closed);
    });
  }

  close() { clearInterval(this.heartbeat); this.controls(); this.socket.close(); }
  get player() { return this.state?.players[this.admission.playerId]?.player; }
}

async function moveTo(client, x) {
  const start = client.player.x;
  if (Math.abs(start - x) < 12) return;
  client.controls(start < x ? { right: true } : { left: true });
  await client.wait((state) => {
    const position = state.players[client.admission.playerId].player.x;
    return start < x ? position >= x - 10 : position <= x + 10;
  }, 6000);
  client.controls();
}

async function jumpTo(client, x, feet) {
  await client.wait((state) => state.players[client.admission.playerId].player.grounded);
  client.controls({ jump: true });
  await client.wait((state) => state.players[client.admission.playerId].player.vy < 0);
  await moveTo(client, x);
  await client.wait((state) => {
    const player = state.players[client.admission.playerId].player;
    return player.grounded && Math.abs(player.y + player.height - feet) < 1;
  }, 6000);
}

/** Four real WebSocket connections, including the host; no client-side simulation or teleporting. */
export async function checkArcadeLive({ backend, frontend, secret, adminPassword }) {
  const password = randomBytes(18).toString("hex");
  const rotatedPassword = randomBytes(18).toString("hex");
  const clients = [];
  let host;
  let guestCookie;
  let succeeded = false;
  let checks = 0;
  const passed = (label) => { checks++; console.log(`✓ ${label}`); };
  const internal = async (body) => fetch(backend, {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "x-arcade-client": "live-check" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const admit = async (index, candidate = password) => {
    const body = { nickname: ["Ведущая", "Мята", "Апельсин", "Розовый"][index] || "Пятый", color: ["#a899ff", "#61d6bd", "#ffb66b", "#ef8fae"][index] || "#a899ff" };
    const response = frontend ? await fetch(`${frontend}/api/arcade/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, role: "player", password: candidate }),
      signal: AbortSignal.timeout(15_000),
    }) : await internal({ ...body, action: "join", password: candidate });
    return { response, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };

  const before = await (await fetch(backend, { signal: AbortSignal.timeout(15_000) })).json();
  assert.equal(before.hostOnline, false, "Live check requires an empty rehearsal room");
  assert.equal(before.open, false, "Live check must not interrupt an open event");
  try {
    let hostAdmission;
    if (frontend && adminPassword) {
      const login = await fetch(`${frontend}/api/chepuha/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      const session = await fetch(`${frontend}/api/arcade/session`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ role: "host", nickname: "Ведущая", color: "#a899ff" }) });
      assert.equal(session.status, 200);
      hostAdmission = await session.json();
      passed("вход ведущей проходит через Next.js и защищённую сессию");
    } else {
      hostAdmission = await (await internal({ action: "host", nickname: "Ведущая", color: "#a899ff" })).json();
    }
    host = new PlayerClient(backend, hostAdmission); clients.push(host);
    await host.wait((state) => state.players.host?.connected);
    host.send({ type: "room", action: "open", password });
    await host.wait((state, room) => state.phase === "lobby" && room.open);
    const wrong = await admit(1, "incorrect-test-password"); assert.equal(wrong.response.status, 403);
    passed("неверный пароль отвергается до подключения к игре");
    for (let index = 1; index < 4; index++) {
      const admission = await admit(index); assert.equal(admission.response.status, 200);
      if (index === 1) guestCookie = admission.cookie;
      const client = new PlayerClient(backend, admission.body); clients.push(client);
      await client.wait((state) => Object.values(state.players).filter((player) => player.connected).length === index + 1);
      if (frontend && admission.cookie) {
        const restored = await fetch(`${frontend}/api/arcade/session?role=player`, { headers: { Cookie: admission.cookie } });
        assert.equal(restored.status, 200);
        assert.equal((await restored.json()).playerId, admission.body.playerId);
      }
    }
    await Promise.all(clients.map((client) => client.wait((state) => Object.values(state.players).filter((player) => player.connected).length === 4)));
    const overflow = await admit(4); assert.equal(overflow.response.status, 409);
    passed("четыре клиента видят общую комнату; пятый не допускается");
    clients[1].send({ type: "command", command: "start" });
    for (let index = 0; index < 3; index++) await host.nextState();
    assert.equal(host.state.phase, "lobby");
    passed("игрок не может запускать мероприятие вместо ведущей");
    host.command("start"); await host.wait((state) => state.phase === "task");
    const runner = clients[1];
    await jumpTo(runner, 190, 520);
    await jumpTo(runner, 390, 440);
    await jumpTo(runner, 470, 284);
    runner.send({ type: "interact", station: "heading" });
    await host.wait((state) => state.taskStep === 1);
    await jumpTo(runner, 650, 362);
    await moveTo(runner, 780);
    await jumpTo(runner, 1000, 320);
    runner.send({ type: "interact", station: "save" });
    await Promise.all(clients.map((client) => client.wait((state) => state.phase === "task-complete" && state.taskStep === 2)));
    passed("герой проходит настоящий маршрут; документ обновляется у всех четырёх");

    const old = clients[3]; const id = old.admission.playerId; const position = { ...old.player };
    old.close();
    await host.wait((state) => !state.players[id].connected);
    const reconnected = new PlayerClient(backend, old.admission); clients[3] = reconnected;
    await reconnected.wait((state) => state.players[id].connected);
    assert.equal(reconnected.player.x, position.x); assert.equal(reconnected.player.hp, position.hp);
    passed("переподключение возвращает тот же ник, героя и здоровье");

    const previousHost = host;
    const previousGuest = clients[1];
    const guestId = previousGuest.admission.playerId;
    previousHost.close();
    await clients[2].wait((state, room) => state.paused && !room.hostOnline);
    if (frontend && guestCookie) {
      const retained = await fetch(`${frontend}/api/arcade/session?role=player`, { headers: { Cookie: guestCookie }, signal: AbortSignal.timeout(15_000) });
      assert.equal(retained.status, 200);
      assert.equal((await retained.json()).playerId, guestId);
    }
    const retainedPosition = { ...previousGuest.player };
    previousGuest.close();
    await clients[2].wait((state) => !state.players[guestId].connected);
    const waitingGuest = new PlayerClient(backend, previousGuest.admission);
    try { await waitingGuest.waitClosed(4005); }
    finally { waitingGuest.close(); }
    host = new PlayerClient(backend, previousHost.admission); clients[0] = host;
    await host.wait((state, room) => state.paused && room.hostOnline);
    const returningGuest = new PlayerClient(backend, previousGuest.admission); clients[1] = returningGuest;
    await returningGuest.wait((state) => state.players[guestId].connected);
    assert.equal(returningGuest.player.x, retainedPosition.x);
    assert.equal(returningGuest.player.hp, retainedPosition.hp);
    host.command("resume");
    await Promise.all(clients.map((client) => client.wait((state, room) => !state.paused && room.hostOnline && state.players[guestId].connected)));
    passed("отключение ведущей ставит игру на паузу; гость сохраняет вход и возвращается тем же героем");

    host.command("next"); await host.wait((state) => state.phase === "quiz");
    await Promise.all(clients.map((client, index) => moveTo(client, [450, 410, 720, 1010][index])));
    await host.wait((state) => Object.values(state.players).every((player) => player.quizChoice !== null));
    host.command("reveal"); await host.wait((state) => state.phase === "quiz-reveal");
    assert.equal(host.state.quizCorrectCount, 2); assert.equal(host.state.quizTotal, 4);
    passed("четыре личных ответа дают общий бонус за два правильных");
    host.command("next"); await host.wait((state) => state.phase === "boss");
    assert.equal(host.state.boss.hp, 163);
    host.command("pause"); await host.wait((state) => state.paused);
    const frozen = host.state.time;
    for (let index = 0; index < 3; index++) await host.nextState();
    assert.equal(host.state.time, frozen);
    host.command("resume"); await host.wait((state) => !state.paused);
    host.command("retry"); await host.wait((state) => state.attempt === 2);
    assert.equal(host.state.boss.maxHp, 122);
    passed("пауза замораживает общую игру, повтор уменьшает HP босса");
    for (const client of clients) client.controls({ shoot: true });
    await Promise.all(clients.map((client) => client.wait((state) => state.phase === "victory", 20_000)));
    for (const client of clients) client.controls();
    assert.equal(host.state.boss.hp, 0);
    passed("четыре игрока стреляют и получают одну общую победу");

    host.command("restart"); await host.wait((state) => state.phase === "lobby");
    host.send({ type: "room", action: "password", password: rotatedPassword });
    await host.wait((state) => Object.keys(state.players).length === 1);
    const oldPassword = await admit(1); assert.equal(oldPassword.response.status, 403);
    const newPassword = await admit(1, rotatedPassword); assert.equal(newPassword.response.status, 200);
    passed("смена пароля отзывает старые входы и принимает новый пароль");
    host.send({ type: "room", action: "close" });
    await host.wait((state, room) => state.phase === "closed" && !room.open);
    const closed = await (await fetch(backend)).json(); assert.equal(closed.open, false);
    passed("закрытие мероприятия блокирует дальнейший вход");
    if (frontend) {
      const unsignedHost = await fetch(`${frontend}/api/arcade/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "host", nickname: "Чужой", color: "#a899ff" }) });
      assert.equal(unsignedHost.status, 401);
      const crossOrigin = await fetch(`${frontend}/api/arcade/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: "{}" });
      assert.equal(crossOrigin.status, 403);
      passed("Next.js не выдаёт права ведущей без входа и отвергает чужой Origin");
    }
    console.log(`Live multiplayer: ${checks} checks passed with four WebSocket clients.`);
    succeeded = true;
  } finally {
    let cleanupHost = host;
    try {
      if (host && host.socket.readyState !== WebSocket.OPEN) {
        cleanupHost = new PlayerClient(backend, host.admission);
        clients.push(cleanupHost);
        await cleanupHost.wait((state) => state.players.host?.connected);
      }
      if (cleanupHost?.socket.readyState === WebSocket.OPEN) {
        cleanupHost.send({ type: "room", action: "close" });
        await cleanupHost.wait((state, room) => state.phase === "closed" && !room.open);
      }
      const finalStatus = await (await fetch(backend, { signal: AbortSignal.timeout(15_000) })).json();
      if (finalStatus.open) throw new Error("После проверки комната осталась открыта");
    } catch {
      if (succeeded) throw new Error("Проверка завершилась, но закрытие комнаты не подтверждено");
      console.error("Закрытие комнаты после неудачной проверки не подтверждено; ведущей нужно проверить её состояние.");
    } finally {
      for (const client of clients) client.close();
    }
  }
}
