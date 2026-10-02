import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkArcadeLive, checkLegacyParty } from "./check-arcade-live.mjs";

const secret = randomBytes(32).toString("hex");
const adminPassword = randomBytes(24).toString("hex");
const adminSecret = randomBytes(32).toString("hex");
const children = [];
const directory = await mkdtemp(path.join(tmpdir(), "arcade-e2e-"));
let logs = "";

function launch(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const capture = (chunk) => {
    let safe = String(chunk);
    for (const value of [secret, adminPassword, adminSecret]) safe = safe.replaceAll(value, "<masked>");
    safe = safe.replace(/([?&]token=)[^\s"']+/g, "$1<masked>");
    logs = (logs + safe).slice(-8000);
  };
  child.stdout.on("data", capture); child.stderr.on("data", capture);
  children.push(child); return child;
}

async function ready(url, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch { /* Starting a local server. */ }
    if (children.some((child) => child.exitCode !== null)) throw new Error("Локальный сервер завершился при запуске");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Локальный сервер не успел запуститься");
}

try {
  launch(["node_modules/partykit/dist/bin.mjs", "dev", "-c", "partykit.arcade.json", "--port", "1998", "--persist", directory, "--var", `ARCADE_SECRET=${secret}`, "--no-hotkeys", "--disable-request-cf-fetch"]);
  await ready("http://127.0.0.1:1998/parties/arcade/demo");
  console.log("PartyKit local server ready.");
  await checkLegacyParty("http://127.0.0.1:1998/parties/arcade/demo");
  launch(["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3020"], {
    ARCADE_SECRET: secret, ADMIN_PASSWORD: adminPassword, ADMIN_SECRET: adminSecret,
    NEXT_PUBLIC_ARCADE_HOST: "127.0.0.1:1998", ARCADE_TEST_BUILD_DIR: ".next-arcade-test",
  });
  await ready("http://127.0.0.1:3020/api/arcade/status");
  console.log("Next.js local multiplayer server ready.");
  await checkArcadeLive({ backend: "http://127.0.0.1:1998/parties/arcade/demo", frontend: "http://127.0.0.1:3020", secret, adminPassword });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Live multiplayer check failed");
  console.error(logs);
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ } }
  }
  await rm(directory, { recursive: true, force: true });
}
