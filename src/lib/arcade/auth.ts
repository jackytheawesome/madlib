/** Signed admission tickets shared by Next.js and the authoritative game server. */
export type ArcadeTicket = {
  version: 1;
  room: "demo";
  playerId: string;
  role: "host" | "guest";
  nickname: string;
  color: string;
  epoch: number;
  expiresAt: number;
};

type Admission = Omit<ArcadeTicket, "version" | "room" | "expiresAt">;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding");
  const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  if (secret.length < 32) throw new Error("ARCADE_SECRET must contain at least 32 characters");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function issueTicket(secret: string, admission: Admission, lifetimeSeconds = 12 * 60 * 60): Promise<string> {
  const ticket: ArcadeTicket = {
    ...admission,
    version: 1,
    room: "demo",
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };
  const body = base64url(encoder.encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyTicket(secret: string, token: string): Promise<ArcadeTicket | null> {
  try {
    if (token.length > 4096) return null;
    const pieces = token.split(".");
    if (pieces.length !== 2) return null;
    const [body, signature] = pieces;
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), decode64(signature), encoder.encode(body))) return null;
    const ticket: unknown = JSON.parse(decoder.decode(decode64(body)));
    if (!ticket || typeof ticket !== "object") return null;
    const value = ticket as Record<string, unknown>;
    if (value.version !== 1 || value.room !== "demo"
      || (value.role !== "host" && value.role !== "guest")
      || typeof value.playerId !== "string" || value.playerId.length < 1 || value.playerId.length > 80
      || (value.role === "host" && value.playerId !== "host")
      || (value.role === "guest" && value.playerId === "host")
      || typeof value.nickname !== "string" || value.nickname.length < 1 || value.nickname.length > 24
      || typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)
      || typeof value.epoch !== "number" || !Number.isSafeInteger(value.epoch) || value.epoch < 0
      || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)
      || value.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return ticket as ArcadeTicket;
  } catch {
    return null;
  }
}
