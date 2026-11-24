import { loginSchema } from "@/lib/validation";
import { login } from "@/server/auth";
import { errorResponse, json, readJson } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";
import { sessionCookie } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signs a team member in and sets the session cookie. Slowed down after repeated wrong passwords. */
export async function POST(req: Request) {
  try {
    const { username, password } = loginSchema.parse(await readJson(req, 5_000));
    const ip = clientIp(req);
    if (!allow(`login:${ip}`, 10, 15 * 60_000) || !allow(`login-user:${username.trim().toLowerCase()}`, 10, 15 * 60_000)) {
      return json({ error: "tooManyRequests" }, 429);
    }
    const { token, user } = login(username, password);
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token, req), "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
