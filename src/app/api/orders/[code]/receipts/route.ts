import { errorResponse, json, keyFrom } from "@/server/http";
import { MAX_ORDER_FILE_BYTES } from "@/server/order-files";
import { addReceipt } from "@/server/orders";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Uploads a payment screenshot (multipart field "file"). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { code } = await params;
    if (!allow(`receipt:${clientIp(req)}`, 30, 60 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    if (Number(req.headers.get("content-length") ?? "0") > MAX_ORDER_FILE_BYTES + 64 * 1024) return json({ error: "tooBig" }, 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return json({ error: "invalid" }, 400);
    return json(addReceipt(code, keyFrom(req), Buffer.from(await file.arrayBuffer())));
  } catch (e) {
    return errorResponse(e);
  }
}
