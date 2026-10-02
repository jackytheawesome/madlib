import { NO_STORE, requestArcadeRoom } from "@/lib/arcade/backend";

export async function GET() {
  try {
    const upstream = await requestArcadeRoom();
    if (!upstream.ok) throw new Error();
    const status = await upstream.json();
    return Response.json(status, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Комната пока недоступна. Попробуйте чуть позже." }, { status: 503, headers: NO_STORE });
  }
}
