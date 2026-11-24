import { checkoutSchema } from "@/lib/validation";
import { errorResponse, json, readJson } from "@/server/http";
import { createOrder } from "@/server/orders";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Places an order from the cart. Prices are recalculated here; the browser only sends choices. */
export async function POST(req: Request) {
  try {
    if (!allow(`order:${clientIp(req)}`, 15, 60 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    const input = checkoutSchema.parse(await readJson(req, 2_000_000));
    return json(createOrder(input), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
