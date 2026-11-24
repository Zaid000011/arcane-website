import { readRequestFileForTeam } from "@/server/requests";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INLINE = ["image/png", "image/jpeg", "image/webp"];

/**
 * A file a customer sent, for signed-in team members. Photos open in the
 * browser; everything else downloads. The sandbox header stops SVG or PDF
 * files from running scripts on this site.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string; fileId: string }> }) {
  return team(req, "requests.manage", async () => {
    const { code, fileId } = await params;
    const file = readRequestFileForTeam(code, fileId);
    const download = new URL(req.url).searchParams.has("download") || !INLINE.includes(file.type);
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
