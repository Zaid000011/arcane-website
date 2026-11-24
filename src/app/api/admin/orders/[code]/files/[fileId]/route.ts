import { readFileForTeam } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A payment screenshot or proof image, for signed-in team members. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string; fileId: string }> }) {
  return team(req, "orders.view", async () => {
    const { code, fileId } = await params;
    const file = readFileForTeam(code, fileId);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
