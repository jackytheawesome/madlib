import { cookies } from "next/headers";
import { verifyTicket } from "@/lib/arcade/auth";
import { arcadeSecret, NO_STORE, requestArcadeRoom, sameOrigin } from "@/lib/arcade/backend";
import { hostLoginConfigured, isHostAuthenticated } from "@/lib/arcade/host-auth";

const MAX_AGE = 12 * 60 * 60;
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/arcade" };
const cookieName = (host: boolean) => host ? "arcade_host" : "arcade_player";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function sessionResponse(upstream: Response, host: boolean) {
  const body = await upstream.json();
  if (!upstream.ok) return json(body, upstream.status);
  if (typeof body.token !== "string" || typeof body.playerId !== "string") throw new Error();
  (await cookies()).set(cookieName(host), body.token, { ...COOKIE_OPTIONS, maxAge: MAX_AGE });
  return json(body);
}

export async function GET(request: Request) {
  const host = new URL(request.url).searchParams.get("role") === "host";
  const jar = await cookies();
  const token = jar.get(cookieName(host))?.value;
  if (!token) return json({ error: "Войдите в комнату" }, 401);
  try {
    const ticket = await verifyTicket(arcadeSecret(), token);
    if (!ticket || (ticket.role === "host") !== host || (host && (!hostLoginConfigured() || !await isHostAuthenticated()))) {
      jar.set(cookieName(host), "", { ...COOKIE_OPTIONS, maxAge: 0 });
      return json({ error: "Войдите в комнату заново" }, 401);
    }
    const upstream = await requestArcadeRoom({ action: "session", token });
    if (upstream.status === 401 || upstream.status === 403) jar.set(cookieName(host), "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return await sessionResponse(upstream, host);
  } catch {
    return json({ error: "Связь с комнатой потеряна. Попробуйте ещё раз." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Нет доступа" }, 403);
  const raw = await request.text();
  if (raw.length > 8192) return json({ error: "Слишком большой запрос" }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  const host = body.role === "host";
  if (!host && body.role !== "player" && body.role !== "guest") return json({ error: "Некорректная роль" }, 400);
  if (typeof body.nickname !== "string" || typeof body.color !== "string" || !body.nickname.trim() || !/^#[0-9a-f]{6}$/i.test(body.color)) {
    return json({ error: "Укажите ник и цвет героя" }, 400);
  }
  if (host) {
    if (!hostLoginConfigured()) return json({ error: "Вход ведущей ещё не настроен" }, 503);
    if (!await isHostAuthenticated()) return json({ error: "Войдите как ведущая" }, 401);
  }
  try {
    const resumeToken = !host ? (await cookies()).get(cookieName(false))?.value : undefined;
    const upstream = await requestArcadeRoom({
      action: host ? "host" : "join", nickname: body.nickname.trim().slice(0, 18), color: body.color,
      ...(host ? {} : { password: body.password, resumeToken }),
    }, request);
    return await sessionResponse(upstream, host);
  } catch {
    return json({ error: "Не удалось связаться с комнатой. Попробуйте ещё раз." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Нет доступа" }, 403);
  const host = new URL(request.url).searchParams.get("role") === "host";
  (await cookies()).set(cookieName(host), "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return json({ ok: true });
}
