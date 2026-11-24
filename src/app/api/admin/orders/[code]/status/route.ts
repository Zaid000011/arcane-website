import { adminStatusSchema } from "@/lib/validation";
import { readJson } from "@/server/http";
import { setOrderStatus } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Moves an order to its next production step (or cancels it). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "orders.status", async (user) => {
    const { code } = await params;
    const { status } = adminStatusSchema.parse(await readJson(req, 5_000));
    setOrderStatus(code, status, new Date(), user.name);
  });
}
