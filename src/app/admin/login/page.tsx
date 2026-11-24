import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm, SetupForm } from "@/components/admin/AuthForms";
import { hasUsers } from "@/server/auth";
import { currentTeamMember, isLocalPage } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentTeamMember()) redirect("/admin/orders");
  const setup = !hasUsers();
  const local = await isLocalPage();

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <p className="font-display text-3xl tracking-wide text-gold uppercase">
        Arcane <span className="text-cream-muted">admin</span>
      </p>
      <div className="card mt-6 p-6">
        {setup ? (
          local ? (
            <>
              <h1 className="font-serif text-xl font-bold text-cream">Create the owner login</h1>
              <p className="mt-1 mb-5 text-sm text-cream-muted">This is the first time the admin panel is opened. You can add your team&apos;s logins after this.</p>
              <SetupForm />
            </>
          ) : (
            <>
              <h1 className="font-serif text-xl font-bold text-cream">Admin isn&apos;t set up yet</h1>
              <p className="mt-2 text-sm text-cream-muted">
                For safety, the first login can only be created on the computer that runs the site. Open <span className="text-cream">http://localhost:3000/admin</span> there.
              </p>
            </>
          )
        ) : (
          <>
            <h1 className="mb-5 font-serif text-xl font-bold text-cream">Sign in</h1>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
