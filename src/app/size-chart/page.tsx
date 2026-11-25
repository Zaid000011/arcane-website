import type { Metadata } from "next";
import { HowToMeasure, OtherSize, SizeChartView } from "@/components/size/SizeChart";
import { tr } from "@/lib/catalog";
import { getLiveCatalog } from "@/server/catalog-store";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.meta.sizeChartTitle };
}

/** Every garment's measurements, size by size, with how to measure. */
export default async function SizeChartPage() {
  const locale = await getLocale();
  const t = getDictionary(locale).sizeChart;
  const catalog = getLiveCatalog();
  const products = catalog.products.filter((p) => p.enabled && catalog.sizeCharts.some((c) => c.productId === p.id));

  return (
    <div className="section py-12 sm:py-16">
      <h1 className="font-display text-5xl tracking-wide uppercase sm:text-6xl">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-cream-muted">{t.pageIntro}</p>

      <nav aria-label={t.title} className="mt-6 flex flex-wrap gap-2">
        {products.map((p) => (
          <a key={p.id} href={`#chart-${p.id}`} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-cream-muted transition-colors hover:border-gold hover:text-cream">
            {tr(p.name, locale)}
          </a>
        ))}
      </nav>

      <section className="card mt-8 p-5 sm:p-6">
        <HowToMeasure />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {products.map((p) => (
          <section key={p.id} id={`chart-${p.id}`} className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby={`chart-${p.id}-title`}>
            <h2 id={`chart-${p.id}-title`} className="mb-4 font-serif text-xl font-bold text-gold">
              {tr(p.name, locale)}
            </h2>
            <SizeChartView catalog={catalog} productId={p.id} />
          </section>
        ))}
      </div>

      <div className="mt-8">
        <OtherSize />
      </div>
    </div>
  );
}
