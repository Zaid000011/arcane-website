import { resetCustomerLink } from "@/server/orders";
import { team } from "@/server/team-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Makes a new private link for a customer who lost theirs. Returns the new key once; the old link stops working. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return team(req, "orders.status", async (user) => {
    const { code } = await params;
    return resetCustomerLink(code, user.name);
  });
}
