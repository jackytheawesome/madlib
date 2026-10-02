import { createHmac } from "node:crypto";

export function arcadeSecret(): string {
  const secret = process.env.ARCADE_SECRET;
  if (!secret || secret.length < 32) throw new Error("Комната ещё не настроена");
  return secret;
}

function roomUrl(): string {
  const host = process.env.NEXT_PUBLIC_ARCADE_HOST?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error("Комната ещё не настроена");
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (local && process.env.NODE_ENV === "production") throw new Error("Комната ещё не настроена");
  return `${local ? "http" : "https"}://${host}/parties/main/demo`;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function requestArcadeRoom(body?: Record<string, unknown>, request?: Request): Promise<Response> {
  const headers = new Headers();
  if (body) {
    const secret = arcadeSecret();
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${secret}`);
    if (request) {
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      headers.set("x-arcade-client", createHmac("sha256", secret).update(address).digest("hex"));
    }
  }
  return fetch(roomUrl(), {
    method: body ? "POST" : "GET", headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store", signal: AbortSignal.timeout(8000),
  });
}

export const NO_STORE = { "Cache-Control": "no-store" };
