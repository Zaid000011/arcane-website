"use client";

import { History, Plus, RotateCcw, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api-client";
import { sleeveLabels, tierLabels, tr } from "@/lib/catalog";
import type { PriceSheet } from "@/lib/catalog/price-sheet";
import { sleevesOf } from "@/lib/catalog/size-charts";
import type { Catalog, SizeTier, Sleeve } from "@/lib/catalog/types";
import type { CatalogVersion } from "@/server/catalog-store";
import { Panel, primaryButton, smallButton, when } from "./ui";

const TIERS: SizeTier[] = ["S", "M", "L", "AO"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A number box (whole numbers, or with one decimal) that only reports valid values, and shows red while the text isn't one. */
function Num({
  value,
  onChange,
  label,
  min = 0,
  max = 1_000_000,
  className = "w-24",
  decimal = false,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
  className?: string;
  decimal?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (Number(t) === value && t.trim() !== "" ? t : String(value)));
  }, [value]);
  const valid = (t: string) => {
    const v = Number(t);
    return (decimal ? /^\d+(\.\d)?$/.test(t.trim()) : t.trim() !== "" && Number.isInteger(v)) && v >= min && v <= max;
  };
  const ok = valid(text);
  return (
    <input
      value={text}
      inputMode={decimal ? "decimal" : "numeric"}
      aria-label={label}
      aria-invalid={!ok}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (valid(t)) onChange(Number(t));
      }}
      className={`${className} rounded-md border bg-ink px-2 py-1.5 text-right text-sm text-cream focus:border-gold focus:outline-none ${ok ? "border-line" : "border-arcane-bright"}`}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="h-4 w-4 accent-[#C9A227]" />;
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-cream-muted uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`pb-2 font-semibold ${i > 0 ? "text-right" : ""}`}>
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

const cellNum = "py-1.5 pl-3 text-right";

export function PriceEditor({ catalog, sheet, versions }: { catalog: Catalog; sheet: PriceSheet; versions: CatalogVersion[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(sheet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [holiday, setHoliday] = useState({ date: "", yearly: false });
  const [chartIndex, setChartIndex] = useState(0);
  // After a save or restore the page sends the prices now in use; start again from them.
  useEffect(() => setDraft(sheet), [sheet]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sheet);
  const edit = (fn: (s: PriceSheet) => void) => {
    setSaved(false);
    setDraft((d) => {
      const n = structuredClone(d);
      fn(n);
      return n;
    });
  };
  const name = (list: { id: string; name: { en: string; ar: string } }[], id: string) => {
    const found = list.find((x) => x.id === id);
    return found ? tr(found.name, "en") : id;
  };

  const save = async () => {
    // A box with text that isn't a valid number would otherwise silently keep its last good value.
    if (document.querySelector('[data-price-editor] [aria-invalid="true"]')) {
      setError("Fix the boxes marked in red first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/prices", { method: "PUT", body: draft });
      setSaved(true);
      router.refresh();
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as string[]).filter((d) => !d.includes(".")) : [];
      setError(details.length ? details.join(" ") : e instanceof ApiError && e.code === "invalid" ? "Some numbers aren't valid. Fix the boxes marked in red." : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: number | "original") => {
    if (!window.confirm(id === "original" ? "Go back to the original built-in prices? Your current prices stay in the history." : `Bring back version ${id}? Your current prices stay in the history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/prices/restore", { method: "POST", body: { id } });
      router.refresh();
    } catch {
      setError("Couldn't restore that version. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const holidayLabel = (h: string) => {
    const parts = h.split("-");
    const [y, m, d] = parts.length === 3 ? parts : [null, parts[0], parts[1]];
    return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${y ? ` ${y}` : " (every year)"}`;
  };

  return (
    <div data-price-editor className="space-y-6 pb-24">
      <div>
        <h1 className="font-display text-4xl tracking-wide uppercase">Prices &amp; sizes</h1>
        <p className="mt-1 max-w-3xl text-sm text-cream-muted">
          Prices are in Egyptian pounds and the size chart in centimetres. Changes apply as soon as you save; orders already placed keep the prices they were charged. Every save is kept, so you can go back.
        </p>
      </div>

      <Panel title="Garments">
        <Table head={["Product", "On sale", "Short sleeve", "Long sleeve"]}>
          {draft.products.map((p, i) => (
            <tr key={p.id}>
              <td className="py-1.5 text-cream">{name(catalog.products, p.id)}</td>
              <td className={cellNum}>
                <Toggle checked={p.enabled} onChange={(v) => edit((s) => void (s.products[i]!.enabled = v))} label={`${name(catalog.products, p.id)} on sale`} />
              </td>
              {(["short", "long"] as Sleeve[]).map((sl) => (
                <td key={sl} className={cellNum}>
                  {p.basePrice[sl] !== undefined ? (
                    <Num value={p.basePrice[sl]!} onChange={(n) => edit((s) => void (s.products[i]!.basePrice[sl] = n))} label={`${name(catalog.products, p.id)} ${sl} sleeve price`} />
                  ) : (
                    <span className="text-cream-muted">not offered</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </Table>
        <div className="mt-4 space-y-2">
          {draft.products.map((p, i) => (
            <details key={p.id} className="rounded-lg bg-ink px-3 py-2">
              <summary className="cursor-pointer text-sm text-cream">{name(catalog.products, p.id)}: fabric weights and fabrics (added to the price)</summary>
              <div className="mt-3 grid gap-6 sm:grid-cols-2">
                <Table head={["Fabric weight", "Extra per piece"]}>
                  {p.gsm.map((g, j) => (
                    <tr key={g.gsm}>
                      <td className="py-1.5 text-cream">{g.gsm} GSM</td>
                      <td className={cellNum}>
                        <Num value={g.priceDelta} min={-100_000} onChange={(n) => edit((s) => void (s.products[i]!.gsm[j]!.priceDelta = n))} label={`${g.gsm} GSM extra`} />
                      </td>
                    </tr>
                  ))}
                </Table>
                <Table head={["Fabric", "Extra per piece"]}>
                  {p.fabrics.map((f, j) => (
                    <tr key={f.id}>
                      <td className="py-1.5 text-cream">{tr(catalog.products.find((x) => x.id === p.id)?.fabrics.find((x) => x.id === f.id)?.name ?? { en: f.id, ar: f.id }, "en")}</td>
                      <td className={cellNum}>
                        <Num value={f.priceDelta} min={-100_000} onChange={(n) => edit((s) => void (s.products[i]!.fabrics[j]!.priceDelta = n))} label={`${f.id} extra`} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </details>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Fits">
          <Table head={["Fit", "Extra per piece"]}>
            {draft.fits.map((f, i) => (
              <tr key={f.id}>
                <td className="py-1.5 text-cream">{name(catalog.fits, f.id)}</td>
                <td className={cellNum}>
                  <Num value={f.priceDelta} min={-100_000} onChange={(n) => edit((s) => void (s.fits[i]!.priceDelta = n))} label={`${f.id} fit extra`} />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Big sizes">
          <Table head={["Size", "Extra per piece"]}>
            {draft.sizes.map((z, i) => (
              <tr key={z.id}>
                <td className="py-1.5 text-cream">{catalog.sizes.find((s) => s.id === z.id)?.label ?? z.id}</td>
                <td className={cellNum}>
                  <Num value={z.surcharge} onChange={(n) => edit((s) => void (s.sizes[i]!.surcharge = n))} label={`${z.id} extra`} />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title="Print methods (per piece, per print area)">
        <Table head={["Method", ...TIERS.map((t) => tr(tierLabels[t], "en")), "One-time setup", "Min. pieces", "Extra days"]}>
          {draft.printMethods.map((m, i) => (
            <tr key={m.id}>
              <td className="py-1.5 text-cream">{name(catalog.printMethods, m.id)}</td>
              {TIERS.map((t) => (
                <td key={t} className={cellNum}>
                  {m.prices[t] !== undefined ? (
                    <Num value={m.prices[t]!} onChange={(n) => edit((s) => void (s.printMethods[i]!.prices[t] = n))} label={`${m.id} ${t} price`} className="w-20" />
                  ) : (
                    <span className="text-cream-muted">—</span>
                  )}
                </td>
              ))}
              <td className={cellNum}>
                <Num value={m.setupFee} onChange={(n) => edit((s) => void (s.printMethods[i]!.setupFee = n))} label={`${m.id} setup fee`} className="w-20" />
              </td>
              <td className={cellNum}>
                <Num value={m.minQty} min={1} max={10_000} onChange={(n) => edit((s) => void (s.printMethods[i]!.minQty = n))} label={`${m.id} minimum pieces`} className="w-16" />
              </td>
              <td className={cellNum}>
                <Num value={m.extraDays} max={60} onChange={(n) => edit((s) => void (s.printMethods[i]!.extraDays = n))} label={`${m.id} extra working days`} className="w-16" />
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-cream-muted">Screen print prices are per color. A dash means that size isn&apos;t offered for the method.</p>
      </Panel>

      <Panel title="Names, numbers and labels">
        <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {(
            [
              ["Name on each piece", draft.personalization.name.perPiece, (s: PriceSheet, n: number) => (s.personalization.name.perPiece = n)],
              ["Number on each piece", draft.personalization.number.perPiece, (s: PriceSheet, n: number) => (s.personalization.number.perPiece = n)],
              ["Class names list, per piece", draft.personalization.namesList.perPiece, (s: PriceSheet, n: number) => (s.personalization.namesList.perPiece = n)],
              ["Class names list, one-time layout", draft.personalization.namesList.setupFee, (s: PriceSheet, n: number) => (s.personalization.namesList.setupFee = n)],
              ["Custom neck label, per piece", draft.personalization.neckLabel.perPiece, (s: PriceSheet, n: number) => (s.personalization.neckLabel.perPiece = n)],
              ["Custom neck label, one-time setup", draft.personalization.neckLabel.setupFee, (s: PriceSheet, n: number) => (s.personalization.neckLabel.setupFee = n)],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex items-center justify-between gap-3">
              <span className="text-cream">{label}</span>
              <Num value={value} onChange={(n) => edit((s) => void set(s, n))} label={label} />
            </label>
          ))}
          <label className="flex items-center justify-between gap-3">
            <span className="text-cream">Most names in a class list</span>
            <Num value={draft.personalization.namesList.maxNames} min={1} max={1000} onChange={(n) => edit((s) => void (s.personalization.namesList.maxNames = n))} label="Most names in a class list" />
          </label>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Delivery speed">
          <Table head={["Speed", "On", "Working days", "% of order", "Minimum fee"]}>
            {draft.deliverySpeeds.map((d, i) => (
              <tr key={d.id}>
                <td className="py-1.5 text-cream">{name(catalog.deliverySpeeds, d.id)}</td>
                <td className={cellNum}>
                  <Toggle checked={d.enabled} onChange={(v) => edit((s) => void (s.deliverySpeeds[i]!.enabled = v))} label={`${d.id} on`} />
                </td>
                <td className={cellNum}>
                  <Num value={d.workingDays} min={1} max={120} onChange={(n) => edit((s) => void (s.deliverySpeeds[i]!.workingDays = n))} label={`${d.id} working days`} className="w-16" />
                </td>
                <td className={cellNum}>
                  <Num value={d.percent} max={100} onChange={(n) => edit((s) => void (s.deliverySpeeds[i]!.percent = n))} label={`${d.id} percent`} className="w-16" />
                </td>
                <td className={cellNum}>
                  <Num value={d.minFee} onChange={(n) => edit((s) => void (s.deliverySpeeds[i]!.minFee = n))} label={`${d.id} minimum fee`} className="w-20" />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Shipping">
          <Table head={["Area", "Fee"]}>
            {draft.shippingZones.map((z, i) => (
              <tr key={z.id}>
                <td className="py-1.5 text-cream">{name(catalog.shippingZones, z.id)}</td>
                <td className={cellNum}>
                  <Num value={z.fee} onChange={(n) => edit((s) => void (s.shippingZones[i]!.fee = n))} label={`${z.id} shipping fee`} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 text-cream">
                <label className="inline-flex items-center gap-2">
                  <Toggle checked={draft.pickup.enabled} onChange={(v) => edit((s) => void (s.pickup.enabled = v))} label="Pickup offered" /> Pickup from the studio
                </label>
              </td>
              <td className={cellNum}>
                <Num value={draft.pickup.fee} onChange={(n) => edit((s) => void (s.pickup.fee = n))} label="Pickup fee" />
              </td>
            </tr>
          </Table>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Payments">
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-cream">Deposit before production (% of the total)</span>
              <Num value={draft.payments.depositPercent} max={100} onChange={(n) => edit((s) => void (s.payments.depositPercent = n))} label="Deposit percent" className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-cream">Allow paying everything on delivery for orders up to (0 = never)</span>
              <Num value={draft.payments.codFullMaxTotal} onChange={(n) => edit((s) => void (s.payments.codFullMaxTotal = n))} label="Cash on delivery limit" />
            </label>
            <p className="text-xs text-cream-muted">100% means customers pay everything before production. The rest is always paid in cash on delivery or at pickup.</p>
          </div>
        </Panel>
        <Panel title="Holidays (no work on these days)">
          <ul className="flex flex-wrap gap-2">
            {draft.holidays.map((h) => (
              <li key={h} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-sm text-cream">
                {holidayLabel(h)}
                <button type="button" onClick={() => edit((s) => void (s.holidays = s.holidays.filter((x) => x !== h)))} aria-label={`Remove ${holidayLabel(h)}`} className="text-cream-muted hover:text-cream">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <input type="date" value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} aria-label="Holiday date" className="rounded-md border border-line bg-ink px-2 py-1.5 text-cream" />
            <label className="inline-flex items-center gap-2 text-cream">
              <Toggle checked={holiday.yearly} onChange={(v) => setHoliday((h) => ({ ...h, yearly: v }))} label="Every year" /> Every year
            </label>
            <button
              type="button"
              disabled={!holiday.date}
              onClick={() => {
                const value = holiday.yearly ? holiday.date.slice(5) : holiday.date;
                edit((s) => void (s.holidays = [...new Set([...s.holidays, value])].sort()));
                setHoliday({ date: "", yearly: false });
              }}
              className={smallButton}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add
            </button>
          </div>
          <p className="mt-2 text-xs text-cream-muted">Fridays and Saturdays are always off. Add each Eid when its date is announced.</p>
        </Panel>
      </div>

      <SizeChartPanel catalog={catalog} draft={draft} edit={edit} chartIndex={chartIndex} setChartIndex={setChartIndex} />

      <Panel title="Colors in stock">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {draft.colors.map((c, i) => {
            const color = catalog.colors.find((x) => x.id === c.id);
            return (
              <li key={c.id}>
                <label className="flex items-center gap-2 rounded-lg bg-ink px-2 py-1.5 text-sm text-cream">
                  <Toggle checked={c.inStock} onChange={(v) => edit((s) => void (s.colors[i]!.inStock = v))} label={`${color ? tr(color.name, "en") : c.id} in stock`} />
                  <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ background: color?.hex }} aria-hidden />
                  <span className={c.inStock ? "" : "text-cream-muted line-through"}>{color ? tr(color.name, "en") : c.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Saved versions" action={<History className="h-5 w-5 text-cream-muted" aria-hidden />}>
        {versions.length ? (
          <ul className="divide-y divide-line text-sm">
            {versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-cream">
                  Version {v.id} · {when(v.createdAt)} · {v.author}
                  {v.note ? <span className="text-cream-muted"> · {v.note}</span> : null}
                  {i === 0 ? <span className="ms-2 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold-light">In use</span> : null}
                </span>
                {i > 0 ? (
                  <button type="button" disabled={busy} onClick={() => void restore(v.id)} className={smallButton}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Bring back
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-muted">Nothing saved yet: the shop uses the original prices.</p>
        )}
        {versions.length ? (
          <button type="button" disabled={busy} onClick={() => void restore("original")} className={`${smallButton} mt-3`}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Go back to the original prices
          </button>
        ) : null}
      </Panel>

      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-ink/95 backdrop-blur-md transition-transform ${dirty || error || saved ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {error ? (
            <p role="alert" className="me-auto text-sm text-arcane-bright">
              {error}
            </p>
          ) : saved && !dirty ? (
            <p role="status" className="me-auto text-sm text-emerald-300">
              Saved. The shop is using the new prices.
            </p>
          ) : (
            <p className="me-auto text-sm text-cream">You have unsaved changes.</p>
          )}
          {dirty ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(sheet);
                  setError(null);
                }}
                className={smallButton}
              >
                Discard
              </button>
              <button type="button" disabled={busy} onClick={() => void save()} className={primaryButton}>
                <Save className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save prices"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The size chart customers see: each garment's measurements in each fit, in cm. */
function SizeChartPanel({
  catalog,
  draft,
  edit,
  chartIndex,
  setChartIndex,
}: {
  catalog: Catalog;
  draft: PriceSheet;
  edit: (fn: (s: PriceSheet) => void) => void;
  chartIndex: number;
  setChartIndex: (i: number) => void;
}) {
  const charts = draft.sizeCharts ?? [];
  const ci = Math.min(chartIndex, Math.max(0, charts.length - 1));
  const chart = charts[ci];
  const product = chart ? catalog.products.find((p) => p.id === chart.productId) : undefined;
  const sleeves = product ? sleevesOf(product) : [];
  const chartName = (c: { productId: string; fitId: string }) =>
    `${tr(catalog.products.find((p) => p.id === c.productId)?.name ?? { en: c.productId, ar: c.productId }, "en")} · ${tr(catalog.fits.find((f) => f.id === c.fitId)?.name ?? { en: c.fitId, ar: c.fitId }, "en")}`;
  const sizeLabel = (id: string) => catalog.sizes.find((s) => s.id === id)?.label ?? id;

  return (
    <Panel title="Size chart (cm, garment laid flat)">
      <p className="mb-4 max-w-3xl text-sm text-cream-muted">
        Customers see this on the size chart page, in the designer and when joining a group order. Chest: armpit to armpit. Length: from the top of the shoulder,
        next to the collar, to the hem. Sleeve: from the shoulder seam to the end of the sleeve. These start as typical measurements; replace them with your
        garments&apos; real ones. Halves like 52.5 are fine.
      </p>
      {charts.length ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Garment and fit">
            {charts.map((c, i) => (
              <button
                key={`${c.productId}-${c.fitId}`}
                type="button"
                aria-pressed={i === ci}
                onClick={() => setChartIndex(i)}
                className="rounded-full border border-line px-3 py-1.5 text-sm text-cream-muted transition-colors hover:border-gold/60 aria-pressed:border-gold aria-pressed:bg-gold aria-pressed:text-ink"
              >
                {chartName(c)}
              </button>
            ))}
          </div>
          {chart ? (
            <Table head={["Size", "Chest", "Length", ...sleeves.map((sl) => tr(sleeveLabels[sl], "en"))]}>
              {chart.rows.map((row, ri) => (
                <tr key={row.sizeId}>
                  <td className="py-1.5 text-cream">{sizeLabel(row.sizeId)}</td>
                  <td className={cellNum}>
                    <Num decimal min={5} max={250} value={row.chest} onChange={(n) => edit((s) => void (s.sizeCharts![ci]!.rows[ri]!.chest = n))} label={`${chartName(chart)} ${sizeLabel(row.sizeId)} chest`} />
                  </td>
                  <td className={cellNum}>
                    <Num decimal min={5} max={250} value={row.length} onChange={(n) => edit((s) => void (s.sizeCharts![ci]!.rows[ri]!.length = n))} label={`${chartName(chart)} ${sizeLabel(row.sizeId)} length`} />
                  </td>
                  {sleeves.map((sl) =>
                    row.sleeve[sl] !== undefined ? (
                      <td key={sl} className={cellNum}>
                        <Num
                          decimal
                          min={5}
                          max={250}
                          value={row.sleeve[sl]!}
                          onChange={(n) => edit((s) => void (s.sizeCharts![ci]!.rows[ri]!.sleeve[sl] = n))}
                          label={`${chartName(chart)} ${sizeLabel(row.sizeId)} ${sl} sleeve`}
                        />
                      </td>
                    ) : (
                      <td key={sl} className={`${cellNum} text-cream-muted`}>
                        –
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </Table>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-cream-muted">No size chart yet.</p>
      )}
    </Panel>
  );
}
