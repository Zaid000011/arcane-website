import { assetIdSchema } from "@/lib/validation";
import { MAX_ASSET_BYTES, saveAsset } from "@/server/assets";
import { errorResponse, json } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uploads one artwork file (multipart: id, file). The id is chosen by the browser so designs keep working offline. */
export async function POST(req: Request) {
  try {
    if (!allow(`asset:${clientIp(req)}`, 60, 10 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    if (Number(req.headers.get("content-length") ?? "0") > MAX_ASSET_BYTES + 64 * 1024) return json({ error: "tooBig" }, 413);
    const form = await req.formData();
    const id = assetIdSchema.parse(form.get("id"));
    const file = form.get("file");
    if (!(file instanceof Blob)) return json({ error: "invalid" }, 400);
    const result = saveAsset(id, Buffer.from(await file.arrayBuffer()));
    if (result === "badType") return json({ error: "badType" }, 415);
    if (result === "tooBig") return json({ error: "tooBig" }, 413);
    return json({ status: result });
  } catch (e) {
    return errorResponse(e);
  }
}
