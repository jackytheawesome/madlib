import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkArcadeLive, checkLegacyParty } from "./check-arcade-live.mjs";

// Credentials remain in this process and are piped to the provider CLIs, never printed.
const secret = randomBytes(32).toString("hex");
process.env.ARCADE_SECRET = secret;
const cloudflare = !process.argv.includes("--partykit");

function safe(value) {
  return value.replaceAll(secret, "<masked>").replace(/(?:https?|wss?):\/\/[^\s"<>]+/g, (candidate) => {
    try { const url = new URL(candidate); if (url.search || url.hash) return `${url.origin}${url.pathname}?<masked>`; } catch { /* Non-URL text. */ }
    return candidate;
  });
}

function cli(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", () => reject(new Error(`${executable}: не удалось запустить команду`)));
    // 'close' waits for stdout/stderr to drain, so JSON cannot be truncated at process exit.
    child.on("close", (code) => code === 0 ? resolve({ output, errors }) : reject(new Error(`${executable}: команда завершилась с кодом ${code}\n${safe(errors).slice(-5000)}`)));
    child.stdin.on("error", () => { /* A failed command is reported safely by its close event. */ });
    child.stdin.end(input || "");
  });
}

async function waitForBackend(backend) {
  // Initial PartyKit DNS provisioning and environment propagation can take up to two minutes.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(backend, {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "host", nickname: "Проверка выпуска", color: "#a899ff" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
    } catch { /* Retry DNS or propagation delays without logging signed credentials. */ }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Сервер PartyKit не подтвердил готовность и новый секрет комнаты");
}

async function main() {
  const previousRelease = await readFile("docs/ARCADE_RELEASE.json", "utf8").then(JSON.parse).catch(() => null);
  const expectedBackend = process.env.ARCADE_RELEASE_BACKEND || (cloudflare ? previousRelease?.backend : "https://chepuha-arcade-demo.jackytheawesome.partykit.dev/parties/arcade/demo");
  const existing = expectedBackend ? await fetch(expectedBackend, { signal: AbortSignal.timeout(10_000) }).catch(() => null) : null;
  if (existing?.ok) {
    const status = await existing.json();
    if (status.open || status.hostOnline) throw new Error("Перед выпуском нужно закрыть текущую репетицию");
  }
  let backendOrigin;
  if (cloudflare) {
    console.log("Deploying the arcade room directly to Cloudflare…");
    const directory = await mkdtemp(path.join(tmpdir(), "arcade-release-"));
    try {
      const secretsFile = path.join(directory, "secrets.json");
      await writeFile(secretsFile, JSON.stringify({ ARCADE_SECRET: secret }), { mode: 0o600 });
      const server = await cli("./node_modules/.bin/wrangler", ["deploy", "-c", "wrangler.arcade.jsonc", "--secrets-file", secretsFile]);
      backendOrigin = `${server.output}\n${server.errors}`.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
    } finally { await rm(directory, { recursive: true, force: true }); }
    if (!backendOrigin) throw new Error("Cloudflare не вернул адрес опубликованного сервера");
  } else {
    console.log("Deploying the separate arcade party on the existing PartyKit server…");
    const server = await cli("./node_modules/.bin/partykit", ["deploy", "-c", "partykit.arcade.json"]);
    backendOrigin = `${server.output}\n${server.errors}`.match(/Deployed [^\n]* to (https:\/\/[a-z0-9.-]+\.partykit\.dev)/i)?.[1];
    if (!backendOrigin) throw new Error("PartyKit не вернул адрес опубликованного сервера");
    await cli("./node_modules/.bin/partykit", ["env", "add", "ARCADE_SECRET", "-c", "partykit.arcade.json"], secret);
  }
  console.log(`Room server deployed: ${backendOrigin}`);
  await waitForBackend(`${backendOrigin}/parties/arcade/demo`);
  if (!cloudflare) await checkLegacyParty(`${backendOrigin}/parties/arcade/demo`);
  await cli("vercel", ["env", "add", "ARCADE_SECRET", "production", "--sensitive", "--yes", "--force"], secret);
  await cli("vercel", ["env", "add", "NEXT_PUBLIC_ARCADE_HOST", "production", "--no-sensitive", "--yes", "--force"], new URL(backendOrigin).host);
  console.log("Room credentials configured; deploying the Vercel demo without changing the existing domain…");
  const deployed = await cli("vercel", ["deploy", "--prod", "--skip-domain", "--yes", "--json", "--no-wait", "--local-config", "vercel.arcade.json"]);
  const data = JSON.parse(deployed.output);
  const item = data.deployment || data;
  if (typeof item.url !== "string") throw new Error("Vercel не вернул адрес демо");
  const frontend = item.url.startsWith("https://") ? item.url : `https://${item.url}`;
  console.log(JSON.stringify({ deploymentUrl: frontend, deploymentId: item.id, status: item.readyState || item.state || "BUILDING" }));
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const inspected = await cli("vercel", ["inspect", frontend, "--json"]);
    const status = JSON.parse(inspected.output);
    const state = status.readyState || status.state || status.deployment?.readyState;
    if (state === "READY") { ready = true; break; }
    if (state === "ERROR" || state === "CANCELED" || state === "BLOCKED") throw new Error(`Сборка Vercel завершилась со статусом ${state}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  if (!ready) throw new Error("Сборка Vercel пока не завершена");
  const page = await fetch(`${frontend}/arcade`, { signal: AbortSignal.timeout(15_000) });
  if (page.status !== 200) throw new Error(`Демо недоступно для игроков: HTTP ${page.status}`);
  console.log(`Vercel READY: ${frontend}/arcade`);
  await checkArcadeLive({ backend: `${backendOrigin}/parties/arcade/demo`, frontend, secret });
  const release = { deploymentUrl: frontend, gameUrl: `${frontend}/arcade`, hostUrl: `${frontend}/arcade?host=1`, backend: `${backendOrigin}/parties/arcade/demo`, status: "READY", fourPlayerCheck: "passed", room: "closed" };
  await writeFile("docs/ARCADE_RELEASE.json", `${JSON.stringify(release, null, 2)}\n`);
  console.log(JSON.stringify(release));
}

main().catch((error) => { console.error(safe(error instanceof Error ? error.message : "Выпуск демо не завершён")); process.exitCode = 1; });
