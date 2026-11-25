"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { can, ROLES, type AdminUser } from "@/lib/admin/roles";

export function AdminNav({ user, newRequests = 0 }: { user: AdminUser; newRequests?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/admin/orders", label: "Orders", show: true },
    { href: "/admin/requests", label: "Requests", show: can(user.role, "requests.manage"), badge: newRequests },
    { href: "/admin/prices", label: "Prices & sizes", show: can(user.role, "prices.edit") },
    { href: "/admin/team", label: "Team", show: can(user.role, "team.manage") },
    { href: "/admin/account", label: "My account", show: true },
  ].filter((l) => l.show) as { href: string; label: string; badge?: number }[];

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/admin/orders" className="font-display text-xl tracking-wide text-gold uppercase">
          Arcane <span className="text-cream-muted">admin</span>
        </Link>
        <nav aria-label="Admin" className="flex flex-wrap gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm ${active ? "bg-gold/15 text-gold-light" : "text-cream-muted hover:text-cream"}`}
              >
                {l.label}
                {l.badge ? (
                  <span className="ms-1.5 rounded-full bg-gold px-1.5 text-xs font-bold text-ink" aria-label={`${l.badge} new`}>
                    {l.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="ms-auto flex items-center gap-3 text-sm">
          <Link href="/" className="text-cream-muted hover:text-cream">
            View shop
          </Link>
          <span className="text-cream-muted">
            {user.name} · {ROLES.find((r) => r.id === user.role)?.label}
          </span>
          <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-cream-muted hover:border-gold hover:text-cream">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      </div>
    </header>
  );
}
