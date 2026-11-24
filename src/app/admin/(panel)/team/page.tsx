import type { Metadata } from "next";
import { TeamManager } from "@/components/admin/TeamManager";
import { listUsers } from "@/server/auth";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requirePageUser("team.manage");
  return <TeamManager users={listUsers()} me={me} />;
}
