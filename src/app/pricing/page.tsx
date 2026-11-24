import { Ruler } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Star } from "@/components/brand/Star";
import { tr } from "@/lib/catalog";
import { getLiveCatalog } from "@/server/catalog-store";
import type { GsmOption, SizeTier } from "@/lib/catalog/types";
import { fmt, formatDelta, formatMoney } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.meta.pricingTitle };
}

export default async function PricingPage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = dict.pricing;
  const catalog = getLiveCatalog();
  const money = (n: number) => formatMoney(n, locale);
  const products = catalog.products.filter((p) => p.enabled);

  const gsmGroups: { title: string; options: GsmOption[] }[] = [
    { title: t.gsmTees, options: catalog.products.find((p) => p.id === "tshirt")?.gsmOptions ?? [] },
    { title: t.gsmFleece, options: catalog.products.find((p) => p.id === "hoodie")?.gsmOptions ?? [] },
    { title: t.gsmVarsity, options: catalog.products.find((p) => p.id === "varsity")?.gsmOptions ?? [] },
  ];

  const tiers: { tier: SizeTier; label: string }[] = [
    { tier: "S", label: t.small },
    { tier: "M", label: t.medium },
    { tier: "L", label: t.large },
    { tier: "AO", label: t.allOver },
  ];

  const p = catalog.personalization;

  return (
    <div className="section py-14">
      <header className="max-w-3xl">
        <p className="eyebrow">Arcane Studios</p>
        <h1 className="mt-4 font-display text-5xl tracking-wide uppercase sm:text-6xl">{t.title}</h1>
        <p className="mt-4 text-lg text-cream-muted">{t.subtitle}</p>
      </header>

      <section className="card mt-10 p-6 sm:p-8" aria-labelledby="how-price">
        <h2 id="how-price" className="font-serif text-xl font-bold text-gold">{t.howTitle}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.howItems.map((item, i) => (
            <li key={item} className="flex items-start gap-3 text-cream-muted">
              <span className="font-serif font-bold text-gold" dir="ltr">{i === 0 ? "=" : "+"}</span>
              {item}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Block title={t.garmentsTitle}>
          <Table head={[t.product, t.shortSleeve, t.longSleeve]}>
            {products.map((product) => (
              <tr key={product.id}>
                <Td strong>{tr(product.name, locale)}</Td>
                <Td>{product.basePrice.short !== undefined ? money(product.basePrice.short) : t.notOffered}</Td>
                <Td>{product.basePrice.long !== undefined ? money(product.basePrice.long) : t.notOffered}</Td>
              </tr>
            ))}
          </Table>
        </Block>

        <Block title={t.fitsTitle}>
          <Table head={[t.item, t.perPieceCol]}>
            {catalog.fits.map((fit) => (
              <tr key={fit.id}>
                <Td strong>{tr(fit.name, locale)}</Td>
                <Td>{formatDelta(fit.priceDelta, locale)}</Td>
              </tr>
            ))}
          </Table>
        </Block>
      </div>

      <Block title={t.gsmTitle} note={dict.designer.gsmHint} className="mt-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {gsmGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-sm font-semibold text-cream">{group.title}</h3>
              <Table head={[t.weightCol, t.perPieceCol]}>
                {group.options.map((g) => (
                  <tr key={g.gsm}>
                    <Td strong>
                      <span className="block">{tr(g.description, locale)}</span>
                      <span className="block text-xs font-normal text-cream-muted" dir="ltr">{g.gsm} GSM</span>
                    </Td>
                    <Td>{formatDelta(g.priceDelta, locale)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
        </div>
      </Block>

      <Block title={t.printsTitle} note={t.printsNote} className="mt-8">
        <Table head={[t.method, ...tiers.map((x) => x.label), t.setup, t.minQty]}>
          {catalog.printMethods.map((method) => {
            const per = method.pricedPerColor ? ` ${t.perColor}` : "";
            return (
              <tr key={method.id}>
                <Td strong>{tr(method.name, locale)}</Td>
                {tiers.map(({ tier }) => {
                  const price = method.prices[tier];
                  return <Td key={tier}>{price !== undefined ? `${money(price)}${per}` : t.notOffered}</Td>;
                })}
                <Td>{method.setupFee > 0 ? `${money(method.setupFee)}${method.setupPerColor ? ` ${t.perColor}` : ""}` : t.none}</Td>
                <Td>{fmt(t.pieces, { n: method.minQty })}</Td>
              </tr>
            );
          })}
        </Table>
      </Block>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Block title={t.personalizationTitle}>
          <Table head={[t.item, t.perPieceCol, t.oneTimeCol]}>
            <tr><Td strong>{t.nameRow}</Td><Td>{money(p.name.perPiece)}</Td><Td>{t.none}</Td></tr>
            <tr><Td strong>{t.numberRow}</Td><Td>{money(p.number.perPiece)}</Td><Td>{t.none}</Td></tr>
            <tr><Td strong>{t.namesListRow}</Td><Td>{money(p.namesList.perPiece)}</Td><Td>{money(p.namesList.setupFee)}</Td></tr>
            <tr><Td strong>{t.neckLabelRow}</Td><Td>{money(p.neckLabel.perPiece)}</Td><Td>{money(p.neckLabel.setupFee)}</Td></tr>
          </Table>
        </Block>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <Block title={t.sizesTitle}>
          {catalog.sizes.some((s) => s.surcharge > 0) ? (
            <Table head={[t.item, t.perPieceCol]}>
              {catalog.sizes.map((size) => (
                <tr key={size.id}>
                  <Td strong><span dir="ltr">{size.label}</span></Td>
                  <Td>{size.surcharge > 0 ? `+${money(size.surcharge)}` : t.noSurcharge}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="rounded-xl border border-line p-4">
              <p className="flex flex-wrap gap-1.5" dir="ltr">
                {catalog.sizes.map((size) => (
                  <span key={size.id} className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-cream">
                    {size.label}
                  </span>
                ))}
              </p>
              <p className="mt-3 text-sm text-cream-muted">{t.sizesSamePrice}</p>
            </div>
          )}
          <Link href="/send?type=size" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-gold-light">
            <Ruler className="h-4 w-4" aria-hidden /> {dict.send.sizeButton}
          </Link>
        </Block>

        <Block title={t.deliveryTitle}>
          <Table head={[t.item, ""]}>
            {catalog.deliverySpeeds.filter((s) => s.enabled).map((speed) => (
              <tr key={speed.id}>
                <Td strong>
                  {tr(speed.name, locale)}
                  <span className="block text-xs font-normal text-cream-muted">{tr(speed.description, locale)}</span>
                </Td>
                <Td>{speed.percent > 0 ? fmt(t.deliveryFee, { percent: speed.percent, min: money(speed.minFee) }) : t.free}</Td>
              </tr>
            ))}
          </Table>
        </Block>

        <Block title={t.shippingTitle}>
          <Table head={[t.item, ""]}>
            {catalog.shippingZones.map((zone) => (
              <tr key={zone.id}>
                <Td strong>{tr(zone.name, locale)}</Td>
                <Td>{money(zone.fee)}</Td>
              </tr>
            ))}
            {catalog.pickup.enabled ? (
              <tr>
                <Td strong>{t.pickup}</Td>
                <Td>{catalog.pickup.fee > 0 ? money(catalog.pickup.fee) : t.free}</Td>
              </tr>
            ) : null}
          </Table>
        </Block>
      </div>

      <p className="mt-10 flex items-center gap-2 text-sm text-cream-muted">
        <Star className="h-3 w-3 text-gold" />
        {t.vatNote}
      </p>

      <div className="mt-10">
        <Link href="/design" className="btn btn-primary">{dict.nav.designCta}</Link>
      </div>
    </div>
  );
}

function Block({ title, note, className = "", children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={className}>
      <h2 className="font-serif text-xl font-bold text-gold">{title}</h2>
      {note ? <p className="mt-1 text-sm text-cream-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-max text-start text-sm">
        <thead className="bg-wine-deep/70 text-cream-muted">
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} scope="col" className="px-4 py-3 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td className={`px-4 py-3 align-top ${strong ? "font-semibold text-cream" : "text-cream-muted"}`}>{children}</td>;
}
