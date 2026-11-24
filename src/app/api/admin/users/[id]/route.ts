import { userPatchSchema } from "@/lib/validation";
import { updateUser } from "@/server/auth";
import { readJson } from "@/server/http";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The owner changes someone's name, role, access or password. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return team(req, "team.manage", async () => {
    const { id } = await params;
    return updateUser(id, userPatchSchema.parse(await readJson(req, 5_000)));
  });
}
