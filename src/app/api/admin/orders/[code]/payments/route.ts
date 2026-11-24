import { adminPaymentSchema } from "@/lib/validation";
import { readJson } from "@/server/http";
import { confirmPayment } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records money received for an order (a checked transfer, or cash on delivery). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "orders.payments", async (user) => {
    const { code } = await params;
    const { amount } = adminPaymentSchema.parse(await readJson(req, 5_000));
    confirmPayment(code, amount, new Date(), user.name);
  });
}
