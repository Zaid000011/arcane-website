import { MessageCircle, Send, Shirt } from "lucide-react";
import type { Metadata } from "next";
import { SendPageForm } from "@/components/send/SendPageForm";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests/types";
import { STATIC_SITE } from "@/lib/site-mode";
import { getLiveCatalog } from "@/server/catalog-store";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.send.metaTitle };
}

type Props = { searchParams: Promise<{ type?: string; product?: string }> };

export default async function SendPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = getDictionary(locale).send;
  // The GitHub Pages copy is built ahead of time, so the form reads ?type= and ?product= itself.
  const sp: { type?: string; product?: string } = STATIC_SITE ? {} : await searchParams;
  const kind: RequestKind = REQUEST_KINDS.includes(sp.type as RequestKind) ? (sp.type as RequestKind) : "design";
  const catalog = getLiveCatalog();
  const icons = [Send, MessageCircle, Shirt];
  const steps = t.steps.map((s, i) => ({ ...s, icon: icons[i] ?? Send }));

  return (
    <div className="section py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">Arcane Studios</p>
        <h1 className="mt-4 font-display text-5xl tracking-wide uppercase sm:text-6xl">{t.pageTitle}</h1>
        <p className="mt-4 text-lg text-cream-muted">{t.pageSubtitle}</p>
      </header>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="card p-5 sm:p-8">
          <SendPageForm catalog={catalog} initialKind={kind} productId={sp.product} />
        </div>
        <ol className="space-y-4 lg:sticky lg:top-24">
          {steps.map((s, i) => (
            <li key={s.title} className="card flex gap-4 p-5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-arcane text-gold">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold text-cream">
                  <span className="me-1.5 text-gold" dir="ltr">{i + 1}.</span>
                  {s.title}
                </span>
                <span className="text-sm text-cream-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
