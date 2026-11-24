import { userCreateSchema } from "@/lib/validation";
import { createUser } from "@/server/auth";
import { readJson } from "@/server/http";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The owner adds a team login. */
export async function POST(req: Request) {
  return team(req, "team.manage", async () => createUser(userCreateSchema.parse(await readJson(req, 5_000))));
}
