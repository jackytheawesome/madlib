export const CHEPUHA_PATH = "/chepuha";
export const CHEPUHA_ADMIN_PATH = `${CHEPUHA_PATH}/admin`;
export const CHEPUHA_API_PATH = "/api/chepuha";

export function chepuhaRoomPath(code: string) {
  return `${CHEPUHA_PATH}/room/${encodeURIComponent(code)}`;
}

export function chepuhaRoomApiPath(code: string) {
  return `${CHEPUHA_API_PATH}/rooms/${encodeURIComponent(code)}`;
}
