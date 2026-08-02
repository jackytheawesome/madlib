export function getPartyKitHost(): string {
  if (process.env.NEXT_PUBLIC_PARTYKIT_HOST) {
    return process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  }
  // локальный partykit dev
  return "127.0.0.1:1999";
}
