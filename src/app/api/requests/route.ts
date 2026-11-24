import { MAX_REQUEST_FILES, MAX_REQUEST_TOTAL_BYTES } from "@/lib/requests/types";
import { customRequestSchema } from "@/lib/validation";
import { errorResponse, json } from "@/server/http";
import { allow, clientIp } from "@/server/rate-limit";
import { createRequest, type IncomingFile } from "@/server/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Send it to us": a customer's own design, a color or a custom size
 * (multipart: "data" = the form as JSON, "files" = up to 5 files).
 */
export async function POST(req: Request) {
  try {
    if (!allow(`request:${clientIp(req)}`, 10, 60 * 60_000)) return json({ error: "tooManyRequests" }, 429);
    if (Number(req.headers.get("content-length") ?? "0") > MAX_REQUEST_TOTAL_BYTES + 256 * 1024) return json({ error: "tooBig" }, 413);
    const form = await req.formData();
    const raw = form.get("data");
    if (typeof raw !== "string" || raw.length > 20_000) return json({ error: "invalid" }, 400);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "invalid" }, 400);
    }
    const input = customRequestSchema.parse(data);
    const entries = form.getAll("files");
    if (entries.length > MAX_REQUEST_FILES) return json({ error: "invalid", details: ["files"] }, 400);
    const files: IncomingFile[] = [];
    for (const entry of entries) {
      if (typeof entry === "string") return json({ error: "invalid", details: ["files"] }, 400);
      files.push({ name: entry.name || "file", data: Buffer.from(await entry.arrayBuffer()) });
    }
    return json(createRequest(input, files), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
