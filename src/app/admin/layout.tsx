import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Arcane admin" },
  robots: { index: false, follow: false },
};

/** The team's admin panel is English and left-to-right, whatever language the shop is showing. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="ltr" lang="en" className="min-h-dvh">
      {children}
    </div>
  );
}
