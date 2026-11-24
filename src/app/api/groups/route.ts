import { createGroupSchema } from "@/lib/validation";
import { createGroup } from "@/server/groups";
import { errorResponse, json, readJson } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Organizer starts a group order. Returns the public code and the private organizer key (shown once). */
export async function POST(req: Request) {
  try {
    if (!allow(`create:${clientIp(req)}`, 20, 60 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    const input = createGroupSchema.parse(await readJson(req, 300_000));
    return json(createGroup(input), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
