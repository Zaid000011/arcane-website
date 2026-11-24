import type { Metadata } from "next";
import { PasswordForm } from "@/components/admin/AuthForms";
import { Panel } from "@/components/admin/ui";
import { ROLES } from "@/lib/admin/roles";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requirePageUser();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display text-4xl tracking-wide uppercase">My account</h1>
      <Panel title="You">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-cream-muted">Name</dt>
          <dd className="text-cream">{user.name}</dd>
          <dt className="text-cream-muted">Username</dt>
          <dd className="text-cream">{user.username}</dd>
          <dt className="text-cream-muted">Role</dt>
          <dd className="text-cream">{ROLES.find((r) => r.id === user.role)?.label}</dd>
        </dl>
      </Panel>
      <Panel title="Change password">
        <PasswordForm />
      </Panel>
    </div>
  );
}
