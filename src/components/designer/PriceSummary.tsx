"use client";

import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { issueMessage, type AnyIssue } from "@/lib/pricing/issues";
import type { Quote } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";

export function PriceSummary({ quote, catalog, extraIssues = [] }: { quote: Quote; catalog: Catalog; extraIssues?: AnyIssue[] }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const money = (n: number) => formatMoney(n, locale);
  // Errors first, then warnings.
  const issues: AnyIssue[] = [...quote.issues, ...extraIssues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const speed = catalog.deliverySpeeds.find((s) => s.id === quote.delivery.speedId);
  const hasTotal = quote.quantity > 0;

  return (
    <section className="card p-5" aria-labelledby="price-title">
      {hasTotal ? (
        <div>
          <h2 id="price-title" className="text-xs font-semibold tracking-wider text-cream-muted uppercase">{t.total}</h2>
          <p className="mt-1 font-display text-4xl tracking-wide text-gold" aria-live="polite">
            {money(quote.total)}
          </p>
          <p className="mt-1 text-sm text-cream-muted">
            {fmt(t.piecesLine, { count: quote.quantity })} · {fmt(t.averagePerPiece, { amount: money(Math.round(quote.total / quote.quantity)) })}
          </p>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-cream-muted">{fmt(t.piecesLine, { count: quote.quantity })}</dt>
              <dd className="text-cream">{money(quote.itemsTotal)}</dd>
            </div>
            {quote.setupTotal > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-cream-muted">{t.oneTimeFees}</dt>
                <dd className="text-cream">{money(quote.setupTotal)}</dd>
              </div>
            ) : null}
            {quote.delivery.fee > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-cream-muted">{fmt(t.deliveryLine, { speed: speed ? tr(speed.name, locale) : "" })}</dt>
                <dd className="text-cream">{money(quote.delivery.fee)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-cream-muted">{t.shippingAtCheckout}</p>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="price-title" className="text-xs font-semibold tracking-wider text-cream-muted uppercase">{t.pricePerPiece}</h2>
            <p className="mt-1 font-display text-4xl tracking-wide text-gold" aria-live="polite">
              {money(quote.unitPrice)}
            </p>
          </div>
          {quote.setupTotal > 0 ? <p className="text-end text-sm text-cream-muted">{fmt(t.plusOneTime, { amount: money(quote.setupTotal) })}</p> : null}
        </div>
      )}

      {issues.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {issues.map((issue, i) => (
            <li
              key={`${issue.code}-${i}`}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${issue.severity === "error" ? "bg-arcane/60 text-cream" : "bg-gold/10 text-gold-light"}`}
            >
              {issue.severity === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              {issueMessage(issue, dict, catalog, locale)}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-cream marker:content-none">
          {t.breakdown}
          <ChevronDown className="h-4 w-4 text-gold transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="mt-3 space-y-2 text-sm">
          {quote.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-4">
              <dt className="text-cream-muted">{tr(line.label, locale)}</dt>
              <dd className="shrink-0 text-end text-cream">
                {hasTotal ? (
                  <>
                    <span className="text-xs text-cream-muted" dir="ltr">
                      {money(line.unit)} × {line.qty}{" "}
                    </span>
                    {money(line.amount)}
                  </>
                ) : (
                  money(line.unit)
                )}
              </dd>
            </div>
          ))}
          {quote.setupLines.length > 0 ? (
            <>
              <div className="pt-2 text-xs font-semibold tracking-wider text-gold uppercase">{t.oneTimeFees}</div>
              {quote.setupLines.map((line) => (
                <div key={line.id} className="flex justify-between gap-4">
                  <dt className="text-cream-muted">{tr(line.label, locale)}</dt>
                  <dd className="shrink-0 text-cream">{money(line.amount)}</dd>
                </div>
              ))}
            </>
          ) : null}
        </dl>
      </details>
    </section>
  );
}
