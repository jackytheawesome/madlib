import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { arcadeSecret } from "./backend";

const COOKIE = "arcade_host_access";
const MAX_AGE = 12 * 60 * 60;

function configuredPassword(): string | undefined {
  return process.env.ARCADE_HOST_PASSWORD || process.env.ADMIN_PASSWORD;
}

export function hostLoginConfigured(): boolean {
  return Boolean(configuredPassword());
}

function passwordDigest(password: string, secret: string): Buffer {
  return createHmac("sha256", secret).update("arcade-host-password-v1\0").update(password).digest();
}

/** Compare fixed-length digests without exposing the configured password length. */
export function verifyHostPassword(password: string): boolean {
  const expected = configuredPassword();
  if (!expected) return false;
  const secret = arcadeSecret();
  return timingSafeEqual(passwordDigest(password, secret), passwordDigest(expected, secret));
}

function signAccess(body: string, password: string): Buffer {
  const secret = arcadeSecret();
  return createHmac("sha256", secret).update("arcade-host-access-v1\0")
    .update(passwordDigest(password, secret)).update("\0").update(body).digest();
}

export function createHostAccessToken(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const password = configuredPassword();
  if (!password) throw new Error("Вход ведущей ещё не настроен");
  const body = `v1.${nowSeconds + MAX_AGE}.${randomBytes(16).toString("hex")}`;
  return `${body}.${signAccess(body, password).toString("base64url")}`;
}

export function verifyHostAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  try {
    const password = configuredPassword();
    if (!password || token.length > 256) return false;
    const parts = token.split(".");
    if (parts.length !== 4) return false;
    const [version, expiry, nonce, signature] = parts;
    if (version !== "v1" || !/^\d{1,16}$/.test(expiry) || !/^[a-f0-9]{32}$/.test(nonce)
      || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
    const expiresAt = Number(expiry);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + MAX_AGE) return false;
    const actual = Buffer.from(signature, "base64url");
    const expected = signAccess(parts.slice(0, 3).join("."), password);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function setHostSession(): Promise<void> {
  (await cookies()).set(COOKIE, createHostAccessToken(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/arcade", maxAge: MAX_AGE,
  });
}

export async function isHostAuthenticated(): Promise<boolean> {
  if (!hostLoginConfigured()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  if (token && verifyHostAccessToken(token)) return true;
  // A dedicated arcade password disables the legacy Chepuha admin-session path.
  return !process.env.ARCADE_HOST_PASSWORD && Boolean(process.env.ADMIN_PASSWORD) && await isAdminAuthenticated();
}
