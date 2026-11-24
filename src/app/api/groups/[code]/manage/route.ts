import { groupPatchSchema } from "@/lib/validation";
import { getAdminGroup, updateGroup } from "@/server/groups";
import { errorResponse, json, keyFrom, readJson } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Organizer view: everyone who joined, with phone numbers. Needs the organizer key. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { code } = await params;
    if (!allow(`manage:${clientIp(req)}`, 120, 60_000)) return json({ error: "tooManyRequests" }, 429);
    return json({ group: getAdminGroup(code, keyFrom(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Organizer changes the name, deadline, status (open / locked / closed) or settings. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { code } = await params;
    const patch = groupPatchSchema.parse(await readJson(req, 100_000));
    return json({ group: updateGroup(code, keyFrom(req), patch) });
  } catch (e) {
    return errorResponse(e);
  }
}
