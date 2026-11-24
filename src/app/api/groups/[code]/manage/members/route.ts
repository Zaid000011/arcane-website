import { bulkMembersSchema } from "@/lib/validation";
import { addMembersAsOrganizer } from "@/server/groups";
import { errorResponse, json, keyFrom, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Organizer adds people directly (one, or a pasted list). Duplicates are skipped and reported. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { members } = bulkMembersSchema.parse(await readJson(req, 200_000));
    return json(addMembersAsOrganizer(code, keyFrom(req), members));
  } catch (e) {
    return errorResponse(e);
  }
}
