import { NO_STORE, sameOrigin } from "@/lib/arcade/backend";
import { hostLoginConfigured, setHostSession, verifyHostPassword } from "@/lib/arcade/host-auth";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Нет доступа" }, 403);
  if (!hostLoginConfigured()) return json({ error: "Вход ведущей ещё не настроен" }, 503);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return json({ error: "Слишком большой запрос" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  try {
    if (typeof body.password !== "string" || !verifyHostPassword(body.password)) return json({ error: "Неверный пароль ведущей" }, 401);
    await setHostSession();
    return json({ ok: true });
  } catch {
    return json({ error: "Вход ведущей ещё не настроен" }, 503);
  }
}
