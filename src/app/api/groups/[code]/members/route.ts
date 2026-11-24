import { memberSchema } from "@/lib/validation";
import { joinGroup } from "@/server/groups";
import { errorResponse, json, readJson } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A classmate adds their name and size. Returns their private edit key (shown once). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!allow(`join:${clientIp(req)}:${code}`, 15, 10 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    const input = memberSchema.parse(await readJson(req, 8_000));
    return json(joinGroup(code, input), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
