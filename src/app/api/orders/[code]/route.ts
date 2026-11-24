import { errorResponse, json, keyFrom } from "@/server/http";
import { getOrder } from "@/server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** The customer's order, with the private key in the x-arcane-key header. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { code } = await params;
    return json(getOrder(code, keyFrom(req)));
  } catch (e) {
    return errorResponse(e);
  }
}
