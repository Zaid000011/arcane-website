import { CalendarOff } from "lucide-react";
import type { Metadata } from "next";
import { daysOff, holidayList, workingRun } from "@/lib/order/working-days";
import { getLiveCatalog } from "@/server/catalog-store";
import { fmt } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.meta.policiesTitle };
}

/** The shop's policies. Working days come from the work calendar, so they match the delivery dates. */
export default async function PoliciesPage() {
  const locale = await getLocale();
  const t = getDictionary(locale).policies;
  const catalog = getLiveCatalog();
  const run = workingRun(catalog, locale);
  const holidays = holidayList(catalog, locale);

  return (
    <div className="section py-12 sm:py-16">
      <h1 className="font-display text-5xl tracking-wide uppercase sm:text-6xl">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-cream-muted">{t.intro}</p>

      <section id="working-days" className="card mt-8 max-w-3xl scroll-mt-24 p-6 sm:p-8" aria-labelledby="working-days-title">
        <h2 id="working-days-title" className="flex items-center gap-3 font-serif text-2xl font-bold text-gold">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-arcane text-gold">
            <CalendarOff className="h-5 w-5" aria-hidden />
          </span>
          {t.workingDaysTitle}
        </h2>
        <ul className="mt-5 space-y-3 leading-relaxed text-cream">
          {run ? <li>{fmt(t.workingDays, run)}</li> : null}
          <li>{fmt(t.closedDays, { days: daysOff(catalog, locale) })}</li>
          <li className="text-cream-muted">{t.ordersAnyDay}</li>
          <li className="text-cream-muted">{t.deliveryCounts}</li>
        </ul>
        {holidays.length ? (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-serif text-sm font-bold tracking-wider text-gold uppercase">{t.holidaysTitle}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {holidays.map((h) => (
                <li key={h} className="rounded-full border border-line px-3 py-1 text-sm text-cream-muted">
                  {h}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-cream-muted">{t.holidaysNote}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
