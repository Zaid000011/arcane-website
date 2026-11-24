import { z } from "zod";
import { ApiFailure } from "./errors";

/** Reads a JSON body but stops at `maxBytes`, so a huge request can't exhaust memory. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiFailure("invalid", 413, ["body too large"]);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiFailure("invalid", 400, ["empty body"]);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiFailure("invalid", 413, ["body too large"]);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiFailure("invalid", 400, ["not JSON"]);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns known errors into a small JSON error the pages can translate. */
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiFailure) return json({ error: e.code, details: e.details ?? null }, e.status);
  if (e instanceof z.ZodError) return json({ error: "invalid", details: e.issues.map((i) => i.path.join(".")) }, 400);
  console.error(e);
  return json({ error: "server" }, 500);
}

export function keyFrom(req: Request): string | null {
  return req.headers.get("x-arcane-key");
}
