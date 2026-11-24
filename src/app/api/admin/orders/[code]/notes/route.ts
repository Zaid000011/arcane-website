import { adminNoteSchema } from "@/lib/validation";
import { readJson } from "@/server/http";
import { addNote } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds a note only the team sees. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "orders.notes", async (user) => {
    const { code } = await params;
    const { text } = adminNoteSchema.parse(await readJson(req, 10_000));
    addNote(code, text, user.name);
  });
}
