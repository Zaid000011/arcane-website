import { proofResponseSchema } from "@/lib/validation";
import { errorResponse, json, keyFrom, readJson } from "@/server/http";
import { respondToProof } from "@/server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** The customer approves the design proof or asks for changes. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { code } = await params;
    const body = proofResponseSchema.parse(await readJson(req, 20_000));
    return json(respondToProof(code, keyFrom(req), body));
  } catch (e) {
    return errorResponse(e);
  }
}
