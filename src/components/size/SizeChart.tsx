"use client";

import { Ruler } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { sleeveLabels, tr } from "@/lib/catalog";
import { cmToInches, sizeChartFor, sleevesOf } from "@/lib/catalog/size-charts";
import type { Catalog, Sleeve } from "@/lib/catalog/types";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

type Unit = "cm" | "in";

const cmFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const inFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * A garment's measurements, size by size, with buttons for its fits, sleeve lengths and cm or inches.
 * `fixed` shows just the given fit and sleeve (e.g. a group order, where the organizer chose them).
 */
export function SizeChartView({ catalog, productId, fitId, sleeve, fixed = false }: { catalog: Catalog; productId: string; fitId?: string; sleeve?: Sleeve; fixed?: boolean }) {
  const { locale, dict } = useI18n();
  const t = dict.sizeChart;
  const product = catalog.products.find((p) => p.id === productId);
  const fits = (product?.fitIds ?? []).map((id) => catalog.fits.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  const sleeves = product ? sleevesOf(product) : [];
  const [fit, setFit] = useState(fitId && fits.some((f) => f.id === fitId) ? fitId : (fits[0]?.id ?? "regular"));
  const [sl, setSl] = useState<Sleeve | undefined>(sleeve && sleeves.includes(sleeve) ? sleeve : sleeves[0]);
  const [unit, setUnit] = useState<Unit>("cm");
  const chart = product ? sizeChartFor(catalog, product.id, fit) : undefined;
  if (!product || !chart) return <p className="text-sm text-cream-muted">{t.noChart}</p>;

  const show = (cm: number | undefined) => (cm === undefined ? "–" : unit === "cm" ? cmFormat.format(cm) : inFormat.format(cmToInches(cm)));
  const rows = catalog.sizes.map((s) => ({ size: s, row: chart.rows.find((r) => r.sizeId === s.id) })).filter((x) => x.row);
  const columns = [
    { key: "A", label: t.chest, help: t.chestHelp },
    { key: "B", label: t.length, help: t.lengthHelp },
    ...(sl ? [{ key: "C", label: t.sleeveLength, help: t.sleeveHelp }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {fixed ? (
          <p className="me-auto self-center text-sm text-cream">
            {[fits.find((f) => f.id === fit), sl ? { name: sleeveLabels[sl] } : null]
              .filter((x): x is NonNullable<typeof x> => Boolean(x))
              .map((x) => tr(x.name, locale))
              .join(" · ")}
          </p>
        ) : null}
        {!fixed && fits.length > 1 ? (
          <Segmented label={t.fit} options={fits.map((f) => ({ id: f.id, label: tr(f.name, locale) }))} value={fit} onChange={setFit} />
        ) : null}
        {!fixed && sleeves.length > 1 ? (
          <Segmented label={t.sleeve} options={sleeves.map((s) => ({ id: s, label: tr(sleeveLabels[s], locale) }))} value={sl ?? sleeves[0]!} onChange={(v) => setSl(v as Sleeve)} />
        ) : null}
        <Segmented
          label={t.units}
          options={[
            { id: "cm", label: t.cm },
            { id: "in", label: t.inches },
          ]}
          value={unit}
          onChange={(v) => setUnit(v as Unit)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[19rem] text-sm">
          <caption className="sr-only">{fmt(t.titleFor, { product: tr(product.name, locale) })}</caption>
          <thead className="bg-wine-deep/70 text-xs text-cream-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {t.size}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2.5 text-center font-semibold">
                  <span className="block text-cream">
                    <span className="me-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-ink" aria-hidden>
                      {c.key}
                    </span>
                    {c.label} <span className="font-normal text-cream-muted">({unit === "cm" ? t.cm : t.inches})</span>
                  </span>
                  <span className="mt-0.5 block font-normal">{c.help}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ size, row }) => (
              <tr key={size.id} className="odd:bg-ink/40">
                <th scope="row" className="px-3 py-2 text-start font-semibold text-cream" dir="ltr">
                  {size.label}
                </th>
                <td className="px-3 py-2 text-center text-cream tabular-nums">{show(row!.chest)}</td>
                <td className="px-3 py-2 text-center text-cream tabular-nums">{show(row!.length)}</td>
                {sl ? <td className="px-3 py-2 text-center text-cream tabular-nums">{show(row!.sleeve[sl])}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-cream-muted">{t.tolerance}</p>
    </div>
  );
}

function Segmented({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-cream-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap rounded-full border border-line bg-ink/80 p-1 text-sm">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className="rounded-full px-3.5 py-1.5 text-cream-muted transition-colors hover:text-cream aria-pressed:bg-gold aria-pressed:text-ink"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A drawing of a top laid flat with where to measure, and the steps. */
export function HowToMeasure() {
  const { dict } = useI18n();
  const t = dict.sizeChart;
  const arrow = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,15rem)_1fr]">
      <svg viewBox="0 0 320 250" role="img" aria-label={t.drawingLabel} className="mx-auto w-full max-w-60 text-cream" direction="ltr">
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#C9A227" />
          </marker>
        </defs>
        {/* The top, laid flat */}
        <path
          d="M134 28 Q160 50 186 28 L226 40 L288 158 L264 172 L216 98 L214 232 L106 232 L104 98 L56 172 L32 158 L94 40 Z"
          fill="rgba(245,235,216,0.06)"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M134 28 Q160 34 186 28" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
        {/* A: chest, armpit to armpit */}
        <line x1="108" y1="106" x2="212" y2="106" stroke="#C9A227" strokeWidth="2.5" markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`} />
        <Label x={160} y={92}>
          A
        </Label>
        {/* B: length, top of the shoulder by the collar to the hem */}
        <line x1="140" y1="36" x2="140" y2="228" stroke="#C9A227" strokeWidth="2.5" markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`} />
        <Label x={152} y={176}>
          B
        </Label>
        {/* C: sleeve, shoulder seam to the end of the sleeve */}
        <line x1="86" y1="34" x2="26" y2="148" stroke="#C9A227" strokeWidth="2.5" markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`} />
        <Label x={44} y={84}>
          C
        </Label>
      </svg>
      <div>
        <h3 className="font-serif text-sm font-bold tracking-wider text-gold uppercase">{t.howTitle}</h3>
        <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-cream-muted marker:text-gold">
          {t.howSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <dl className="mt-3 grid gap-1 text-sm">
          {[
            ["A", t.chest, t.chestHelp],
            ["B", t.length, t.lengthHelp],
            ["C", t.sleeveLength, t.sleeveHelp],
          ].map(([k, label, help]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-ink">{k}</dt>
              <dd className="text-cream">
                {label} <span className="text-cream-muted">· {help}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" fill="#C9A227" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#151515">
        {children}
      </text>
    </g>
  );
}

/** The size chart in a pop-up window, for one garment. */
export function SizeChartDialog({
  open,
  onClose,
  catalog,
  productId,
  fitId,
  sleeve,
  fixed,
  onSendSize,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
  productId: string;
  fitId?: string;
  sleeve?: Sleeve;
  fixed?: boolean;
  /** Opens the "send it to us" form for a size; without it, the button links to that page. */
  onSendSize?: () => void;
}) {
  const { locale, dict } = useI18n();
  const t = dict.sizeChart;
  const product = catalog.products.find((p) => p.id === productId);
  return (
    <Modal open={open} onClose={onClose} title={product ? fmt(t.titleFor, { product: tr(product.name, locale) }) : t.title} closeLabel={t.close} wide>
      {/* Remounted on every opening so it starts from the garment's current fit and sleeve. */}
      {open ? (
        <div className="space-y-6">
          <SizeChartView catalog={catalog} productId={productId} fitId={fitId} sleeve={sleeve} fixed={fixed} />
          <div className="border-t border-line pt-5">
            <HowToMeasure />
          </div>
          <OtherSize
            productId={productId}
            onSendSize={
              onSendSize
                ? () => {
                    onClose();
                    onSendSize();
                  }
                : undefined
            }
          />
        </div>
      ) : null}
    </Modal>
  );
}

/** "Need a size that isn't here?" with a way to send it to us. */
export function OtherSize({ productId, onSendSize }: { productId?: string; onSendSize?: () => void }) {
  const { dict } = useI18n();
  const t = dict.sizeChart;
  const cta = "inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-gold-light";
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-gold/40 bg-ink/50 px-4 py-3 text-sm text-cream-muted">
      {t.otherSize}
      {onSendSize ? (
        <button type="button" onClick={onSendSize} className={cta}>
          {t.otherSizeCta}
        </button>
      ) : (
        <Link href={`/send?type=size${productId ? `&product=${encodeURIComponent(productId)}` : ""}`} className={cta}>
          {t.otherSizeCta}
        </Link>
      )}
    </p>
  );
}

/** A "Size chart" button that opens the chart for one garment. */
export function SizeChartButton({
  catalog,
  productId,
  fitId,
  sleeve,
  fixed,
  onSendSize,
  className = "",
}: {
  catalog: Catalog;
  productId: string;
  fitId?: string;
  sleeve?: Sleeve;
  /** Show only this fit and sleeve, with no buttons to switch. */
  fixed?: boolean;
  onSendSize?: () => void;
  className?: string;
}) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-3.5 py-1.5 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light ${className}`}
      >
        <Ruler className="h-4 w-4" aria-hidden /> {dict.sizeChart.open}
      </button>
      <SizeChartDialog open={open} onClose={() => setOpen(false)} catalog={catalog} productId={productId} fitId={fitId} sleeve={sleeve} fixed={fixed} onSendSize={onSendSize} />
    </>
  );
}
