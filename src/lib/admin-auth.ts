import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "chepuha_admin";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 дней

function secret(): string {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "dev-chepuha-secret";
}

function expectedPassword(): string {
  return process.env.ADMIN_PASSWORD || "chepuha";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function verifyAdminPassword(password: string): boolean {
  const expected = expectedPassword();
  if (password.length !== expected.length) {
    // всё равно считаем hmac, чтобы не палить длину в проде через разные пути
  }
  try {
    const a = Buffer.from(sign(password));
    const b = Buffer.from(sign(expected));
    return a.length === b.length && timingSafeEqual(a, b) && password === expected;
  } catch {
    return password === expected;
  }
}

export async function setAdminSession(): Promise<void> {
  const token = sign("ok");
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  const expected = sign("ok");
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
