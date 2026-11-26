import { Instagram, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Seal } from "@/components/brand/Seal";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";

export function Footer({ dict }: { dict: Dictionary; locale: Locale }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-line bg-wine-deep/60">
      <div className="section grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex items-start gap-5">
          <Seal id="footer-seal" className="h-24 w-24 shrink-0" />
          <p className="max-w-xs text-sm leading-relaxed text-cream-muted">{dict.footer.tagline}</p>
        </div>

        <div>
          <h2 className="eyebrow mb-4">{dict.footer.shop}</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="text-cream-muted hover:text-gold" href="/design">{dict.nav.designCta}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/pricing">{dict.nav.pricing}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/send">{dict.send.designButton}</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow mb-4">{dict.footer.help}</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="text-cream-muted hover:text-gold" href="/#how">{dict.nav.howItWorks}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/#methods">{dict.nav.printMethods}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/#faq">{dict.nav.faq}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/size-chart">{dict.nav.sizeChart}</Link></li>
            <li><Link className="text-cream-muted hover:text-gold" href="/policies">{dict.nav.policies}</Link></li>
          </ul>
        </div>

        {siteConfig.instagramUrl || siteConfig.whatsappNumber ? (
          <div>
            <h2 className="eyebrow mb-4">{dict.footer.follow}</h2>
            <ul className="space-y-2.5 text-sm">
              {siteConfig.instagramUrl ? (
                <li>
                  <a className="inline-flex items-center gap-2 text-cream-muted hover:text-gold" href={siteConfig.instagramUrl} target="_blank" rel="noreferrer">
                    <Instagram className="h-4 w-4" aria-hidden /> Instagram
                  </a>
                </li>
              ) : null}
              {siteConfig.whatsappNumber ? (
                <li>
                  <a className="inline-flex items-center gap-2 text-cream-muted hover:text-gold" href={`https://wa.me/${siteConfig.whatsappNumber}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t border-line">
        <p className="section py-5 text-xs text-cream-muted/80">{fmt(dict.footer.rights, { year })}</p>
      </div>
    </footer>
  );
}
