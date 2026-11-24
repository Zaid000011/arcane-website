import { adminRequestPatchSchema } from "@/lib/validation";
import { readJson } from "@/server/http";
import { updateRequest } from "@/server/requests";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marks a request as contacted or done, or saves the team's note. */
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "requests.manage", async (user) => {
    const { code } = await params;
    const patch = adminRequestPatchSchema.parse(await readJson(req, 20_000));
    return updateRequest(code, patch, user.name);
  });
}
