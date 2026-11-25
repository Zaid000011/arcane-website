import { ArrowRight, ChevronDown, GraduationCap, Ruler, Shirt, Upload, Users } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { Seal } from "@/components/brand/Seal";
import { Star } from "@/components/brand/Star";
import { ProductThumb } from "@/components/three/ProductThumb";
import { startingPrice, tr } from "@/lib/catalog";
import { getLiveCatalog } from "@/server/catalog-store";
import { fmt, formatMoney } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";

const audienceIcons = [GraduationCap, Shirt, Users];

export default async function HomePage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = dict.home;
  const catalog = getLiveCatalog();
  const products = catalog.products.filter((p) => p.enabled);
  const allGsm = products.flatMap((p) => p.gsmOptions.map((g) => g.gsm));
  // Headline words rise in one after another; the text below follows once the last word is on its way.
  let wordCount = 0;
  const titleWords = t.titleLines.map((line) => line.split(/\s+/).filter(Boolean).map((word) => ({ word, delay: 200 + wordCount++ * 110 })));
  const afterTitle = 200 + wordCount * 110 + 150;
  const productColors: Record<string, string> = {
    hoodie: "arcaneRed",
    tshirt: "cream",
    zipHoodie: "black",
    sweatshirt: "heatherGrey",
    polo: "navy",
    varsity: "burgundy",
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(122,10,10,0.55),transparent_60%),radial-gradient(ellipse_at_20%_90%,rgba(74,18,24,0.7),transparent_55%)]" />
        <div className="section relative grid items-center gap-12 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
          <div>
            <p className="eyebrow animate-fade-up">{t.eyebrow}</p>
            <h1 className="mt-5 font-display text-6xl leading-[0.95] tracking-wide text-cream uppercase sm:text-7xl lg:text-8xl">
              {titleWords.map((words, i) => (
                <span key={i} className={`block ${i === 2 ? "text-gold" : ""}`}>
                  {words.map(({ word, delay }, j) => (
                    <Fragment key={j}>
                      {j > 0 ? " " : null}
                      <span className="word-mask">
                        <span className="inline-block animate-rise-in" style={{ animationDelay: `${delay}ms` }}>
                          {word}
                        </span>
                      </span>
                    </Fragment>
                  ))}
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-cream-muted" style={{ animationDelay: `${afterTitle}ms` }}>
              {t.subtitle}
            </p>
            <div className="mt-8 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: `${afterTitle + 150}ms` }}>
              <Link href="/design" className="btn btn-primary px-7 py-3.5 text-base">
                {t.ctaDesign}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
              <Link href="#how" className="btn btn-secondary px-7 py-3.5 text-base">
                {t.ctaHow}
              </Link>
            </div>
            <div className="mt-4 animate-fade-up" style={{ animationDelay: `${afterTitle + 225}ms` }}>
              <Link
                href="/send"
                className="inline-flex items-center gap-2 rounded-full border border-dashed border-gold/60 px-5 py-2.5 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light"
              >
                <Upload className="h-4 w-4" aria-hidden /> {dict.send.designButton}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
            <ul className="mt-8 flex animate-fade-up flex-wrap gap-x-6 gap-y-2 text-sm text-cream-muted" style={{ animationDelay: `${afterTitle + 300}ms` }}>
              {t.highlights.map((h) => (
                <li key={h} className="inline-flex items-center gap-2">
                  <Star className="h-3 w-3 text-gold" />
                  {h}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-glide-in" style={{ animationDelay: "150ms" }}>
            <div className="absolute inset-[-12%] rounded-full bg-gold/10 blur-3xl" aria-hidden />
            {/* Sized explicitly: Safari doesn't stretch an SVG to fill its insets, which left the ring off-center on iPhones. */}
            <svg viewBox="0 0 100 100" className="absolute top-[-8%] left-[-8%] h-[116%] w-[116%] animate-spin-slow text-gold/40" aria-hidden>
              <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 2.2" />
            </svg>
            {[
              "top-[2%] start-[8%] h-4 w-4",
              "top-[18%] end-[0%] h-3 w-3 [animation-delay:1.1s]",
              "bottom-[6%] start-[2%] h-3 w-3 [animation-delay:2s]",
              "bottom-[14%] end-[6%] h-5 w-5 [animation-delay:0.6s]",
            ].map((pos) => (
              <Star key={pos} className={`absolute animate-twinkle text-gold-light ${pos}`} />
            ))}
            <div className="animate-float">
              <Seal id="hero-seal" className="relative w-full drop-shadow-[0_25px_50px_rgba(0,0,0,0.6)]" />
            </div>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="section py-16" aria-labelledby="audiences-title">
        <h2 id="audiences-title" className="text-center font-display text-4xl tracking-wide uppercase sm:text-5xl">
          {t.audiencesTitle}
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {t.audiences.map((a, i) => {
            const Icon = audienceIcons[i] ?? Users;
            return (
              <article key={a.title} className="card group p-7 transition-colors hover:border-gold/50">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-arcane text-gold">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-5 font-serif text-xl font-bold text-gold">{a.title}</h3>
                <p className="mt-2 leading-relaxed text-cream-muted">{a.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Products */}
      <section className="bg-wine-deep/50 py-16" aria-labelledby="products-title">
        <div className="section">
          <div className="flex flex-col items-center text-center">
            <h2 id="products-title" className="font-display text-4xl tracking-wide uppercase sm:text-5xl">
              {t.productsTitle}
            </h2>
            <p className="mt-3 max-w-xl text-cream-muted">
              {fmt(t.productsSubtitle, {
                products: products.length,
                minGsm: Math.min(...allGsm),
                maxGsm: Math.max(...allGsm),
                colors: catalog.colors.filter((c) => c.inStock).length,
              })}
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/design?product=${product.id}`}
                className="card group flex flex-col overflow-hidden transition-colors hover:border-gold/60"
              >
                {/* The picture is placed with explicit sizes: as a stretched flex item, Safari drew it card-wide and off to the right on iPhones. */}
                <div className="relative aspect-square bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.12),transparent_65%)]">
                  <ProductThumb
                    catalog={catalog}
                    productId={product.id}
                    colorId={productColors[product.id] ?? "black"}
                    alt={tr(product.name, locale)}
                    className="absolute inset-4 h-[calc(100%_-_2rem)] w-[calc(100%_-_2rem)] object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 border-t border-line p-4 sm:p-5">
                  <h3 className="font-serif text-lg font-bold text-cream">{tr(product.name, locale)}</h3>
                  <p className="hidden text-sm text-cream-muted sm:block">{tr(product.description, locale)}</p>
                  <p className="mt-auto pt-2 text-sm text-gold">
                    {dict.common.from} {formatMoney(startingPrice(product), locale)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/size-chart" className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-light">
              <Ruler className="h-4 w-4" aria-hidden /> {dict.nav.sizeChart}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section scroll-mt-20 py-20" aria-labelledby="how-title">
        <div className="text-center">
          <h2 id="how-title" className="font-display text-4xl tracking-wide uppercase sm:text-5xl">
            {t.howTitle}
          </h2>
          <p className="mt-3 font-serif text-lg text-gold">{t.howSubtitle}</p>
        </div>
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {t.steps.map((step, i) => (
            <li key={step.title} className="card relative p-6">
              <span className="font-serif text-3xl font-bold text-gold/80" dir="ltr">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-cream">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Print methods */}
      <section id="methods" className="scroll-mt-20 bg-wine-deep/50 py-20" aria-labelledby="methods-title">
        <div className="section">
          <div className="text-center">
            <h2 id="methods-title" className="font-display text-4xl tracking-wide uppercase sm:text-5xl">
              {t.methodsTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-cream-muted">{t.methodsSubtitle}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.printMethods.map((method) => (
              <article key={method.id} className="card p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-serif text-lg font-bold text-gold">{tr(method.name, locale)}</h3>
                  <span className="shrink-0 text-xs text-cream-muted" dir="ltr" aria-label={`Price level ${method.traits.priceLevel} of 3`}>
                    {"$$$".slice(0, method.traits.priceLevel)}
                    <span className="opacity-30">{"$$$".slice(method.traits.priceLevel)}</span>
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-cream-muted">{tr(method.description, locale)}</p>
                <p className="mt-4 text-xs text-cream/80">
                  <Star className="me-1.5 inline h-2.5 w-2.5 text-gold" />
                  {tr(method.traits.bestFor, locale)}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/pricing" className="btn btn-secondary">
              {t.methodsCta}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section scroll-mt-20 py-20" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-center font-display text-4xl tracking-wide uppercase sm:text-5xl">
          {t.faqTitle}
        </h2>
        <div className="mx-auto mt-10 max-w-3xl divide-y divide-line rounded-2xl border border-line">
          {t.faqs.map((item) => (
            <details key={item.q} className="group p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-cream marker:content-none">
                {item.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-gold transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 leading-relaxed text-cream-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="section pb-8">
        <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-arcane px-6 py-14 text-center sm:px-12">
          <Seal id="cta-seal" className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 opacity-15" />
          <h2 className="relative font-display text-4xl tracking-wide text-cream uppercase sm:text-5xl">{t.finalTitle}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-cream/85">{t.finalBody}</p>
          <Link href="/design" className="btn btn-primary relative mt-8 px-8 py-3.5 text-base">
            {t.ctaDesign}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
