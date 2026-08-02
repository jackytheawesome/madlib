export function getPartyKitHost(): string {
  if (process.env.NEXT_PUBLIC_PARTYKIT_HOST) {
    return process.env.NEXT_PUBLIC_PARTYKIT_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  // локальный partykit dev
  return "127.0.0.1:1999";
}

/** На проде localhost PartyKit недоступен друзьям — комнаты не синхронизируются. */
export function isPartyKitMisconfigured(host = getPartyKitHost()): boolean {
  if (typeof window === "undefined") return false;
  const pageHost = window.location.hostname;
  const onLocalPage =
    pageHost === "localhost" || pageHost === "127.0.0.1" || pageHost === "[::1]";
  const partyIsLocal =
    host.startsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("[::1]");
  return !onLocalPage && partyIsLocal;
}
