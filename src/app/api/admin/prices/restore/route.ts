import { restoreSchema } from "@/lib/validation";
import { restoreVersion } from "@/server/catalog-store";
import { readJson } from "@/server/http";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Brings back an earlier price version, or the original prices. */
export async function POST(req: Request) {
  return team(req, "prices.edit", async (user) => restoreVersion(restoreSchema.parse(await readJson(req, 1_000)).id, user.name));
}
