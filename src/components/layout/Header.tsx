"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { useI18n } from "@/i18n/client";
import { CartButton } from "./CartButton";
import { LanguageToggle } from "./LanguageToggle";

export function Header() {
  const { dict } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: "/design", label: dict.nav.design },
    { href: "/pricing", label: dict.nav.pricing },
    { href: "/size-chart", label: dict.nav.sizeChart },
    { href: "/#how", label: dict.nav.howItWorks },
    { href: "/#methods", label: dict.nav.printMethods },
    { href: "/#faq", label: dict.nav.faq },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        {dict.common.skipToContent}
      </a>
      <div className="section flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={dict.nav.home} className="text-2xl">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="text-sm text-cream-muted transition-colors hover:text-gold aria-[current=page]:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle className="hidden sm:inline-flex" />
          <CartButton />
          <Link href="/design" className="btn btn-primary hidden px-5 py-2 sm:inline-flex">
            {dict.nav.designCta}
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 text-cream lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? dict.nav.closeMenu : dict.nav.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="mobile-menu" className="border-t border-line bg-ink lg:hidden">
          <nav className="section flex flex-col py-4" aria-label="Mobile">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="border-b border-line/60 py-3 text-base text-cream hover:text-gold">
                {link.label}
              </Link>
            ))}
            <div className="mt-4 flex items-center gap-3">
              <Link href="/design" className="btn btn-primary flex-1">
                {dict.nav.designCta}
              </Link>
              <LanguageToggle />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
