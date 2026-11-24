"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The shop's header and footer aren't shown in the admin panel, which has its own. */
export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname?.startsWith("/admin") ? null : <>{children}</>;
}
