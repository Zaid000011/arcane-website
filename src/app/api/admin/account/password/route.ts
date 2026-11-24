import { passwordChangeSchema } from "@/lib/validation";
import { changeOwnPassword } from "@/server/auth";
import { readJson } from "@/server/http";
import { sessionToken, team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anyone signed in changes their own password. Their other devices get signed out. */
export async function POST(req: Request) {
  return team(req, undefined, async (user) => {
    const { current, next } = passwordChangeSchema.parse(await readJson(req, 5_000));
    changeOwnPassword(user.id, current, next, sessionToken(req));
  });
}
