import { ApiFailure } from "@/server/errors";
import { MAX_ORDER_FILE_BYTES } from "@/server/order-files";
import { sendProof } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROOF_IMAGES = 6;

/** Sends the customer a proof: up to 6 images (multipart field "files") and an optional note. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "orders.proofs", async (user) => {
    const { code } = await params;
    if (Number(req.headers.get("content-length") ?? "0") > MAX_PROOF_IMAGES * MAX_ORDER_FILE_BYTES + 64 * 1024) throw new ApiFailure("tooBig", 413);
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof Blob);
    if (!files.length || files.length > MAX_PROOF_IMAGES) throw new ApiFailure("invalid", 400, ["files"]);
    const note = String(form.get("note") ?? "").trim().slice(0, 1000);
    sendProof(code, await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))), note, new Date(), user.name);
  });
}
