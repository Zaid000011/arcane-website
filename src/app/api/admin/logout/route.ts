import { logout } from "@/server/auth";
import { clearedSessionCookie, sessionToken } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  logout(sessionToken(req));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie, "Cache-Control": "no-store" } });
}
