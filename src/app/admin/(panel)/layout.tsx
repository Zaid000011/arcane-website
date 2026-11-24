import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { can } from "@/lib/admin/roles";
import { countNewRequests } from "@/server/requests";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  const newRequests = can(user.role, "requests.manage") ? countNewRequests() : 0;
  return (
    <>
      <AdminNav user={user} newRequests={newRequests} />
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </>
  );
}
