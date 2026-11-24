import { errorResponse, keyFrom } from "@/server/http";
import { readFileFor } from "@/server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string; fileId: string }> };

/** A payment screenshot or proof image. Private: needs the order key, and is never cached by shared caches. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { code, fileId } = await params;
    const file = readFileFor(code, keyFrom(req), fileId);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
