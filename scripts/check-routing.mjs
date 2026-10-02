import assert from "node:assert/strict";

// Safe against the real database: no room GET, join, answers or valid admin login.
const origin = process.argv[2] || "http://127.0.0.1:3000";
let checks = 0;

async function request(path, init = {}) {
  const response = await fetch(new URL(path, origin), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.text() };
}

for (const path of ["/", "/chepuha", "/chepuha/room/QA000", "/chepuha/admin/login"]) {
  const { response, body } = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  if (path === "/") {
    assert.match(body, /href="\/chepuha"/);
    assert.match(body, /Новая игра/);
  }
  if (path === "/chepuha") assert.match(body, /Создать комнату/);
  checks++;
}

for (const path of ["/room/QA000?source=invite", "/admin", "/admin/login", "/admin/new", "/admin/edit/story-fairy-small-1?source=bookmark"]) {
  const { response } = await request(path);
  assert.equal(response.status, 308, path);
  const before = new URL(path, origin);
  const after = new URL(response.headers.get("location"), origin);
  assert.equal(after.pathname, `/chepuha${before.pathname}`);
  assert.equal(after.search, before.search);
  checks++;
}

for (const path of ["/chepuha/admin", "/chepuha/admin/new", "/chepuha/admin/edit/story-fairy-small-1"]) {
  const { response } = await request(path);
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/chepuha/admin/login");
  checks++;
}

for (const prefix of ["/api", "/api/chepuha"]) {
  for (const [suffix, status, error] of [["/rooms/QA000", 400, "Нужны message и playerId"], ["/admin/templates", 401], ["/admin/login", 401, "Неверный пароль"]]) {
    const { response, body } = await request(prefix + suffix, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, status, prefix + suffix);
    if (error) assert.equal(JSON.parse(body).error, error);
    checks++;
  }
}

console.log(`PASS: ${checks} route checks — pages, redirects, auth guards and both API paths.`);
