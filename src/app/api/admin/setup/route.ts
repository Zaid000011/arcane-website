import { setupSchema } from "@/lib/validation";
import { createFirstOwner, login } from "@/server/auth";
import { errorResponse, json, readJson } from "@/server/http";
import { isLocal, sessionCookie } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates the first owner login. Only from the computer running the site, and only once. */
export async function POST(req: Request) {
  try {
    if (!isLocal(req.headers)) return json({ error: "notLocal" }, 403);
    const input = setupSchema.parse(await readJson(req, 5_000));
    createFirstOwner(input);
    const { token, user } = login(input.username, input.password);
    return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(token, req), "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
