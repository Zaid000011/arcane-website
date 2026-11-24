import { memberPatchSchema } from "@/lib/validation";
import { deleteMember, getMember, updateMember } from "@/server/groups";
import { errorResponse, json, keyFrom, readJson } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string; memberId: string }> };

/** Member (own edit key) or organizer (admin key) reads, changes or removes an entry. Key goes in the x-arcane-key header. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { code, memberId } = await params;
    return json({ member: getMember(code, memberId, keyFrom(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { code, memberId } = await params;
    if (!allow(`edit:${clientIp(req)}`, 60, 10 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    const patch = memberPatchSchema.parse(await readJson(req, 8_000));
    return json({ member: updateMember(code, memberId, keyFrom(req), patch) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { code, memberId } = await params;
    deleteMember(code, memberId, keyFrom(req));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
