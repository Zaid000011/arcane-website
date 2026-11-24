import { priceSheetSchema } from "@/lib/validation";
import { savePriceSheet } from "@/server/catalog-store";
import { readJson } from "@/server/http";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saves edited prices as a new version. The site uses them straight away. */
export async function PUT(req: Request) {
  return team(req, "prices.edit", async (user) => savePriceSheet(priceSheetSchema.parse(await readJson(req, 200_000)), user.name));
}
