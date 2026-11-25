"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { ElementShape } from "@/components/designer/ElementShape";
import { GarmentImage } from "@/components/three/GarmentImage";
import { sleeveLabels, tierLabels, tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import type { OrderItem, OrderView } from "@/lib/checkout/types";
import { withFreePrints } from "@/lib/design/logic";
import { useMeasureStore } from "@/lib/design/measure-store";
import { isPrintSide, panelBox, placeRect, printBounds, rectPlacementText, sideNames } from "@/lib/design/sides";
import type { DesignElement } from "@/lib/design/types";
import { fontById } from "@/lib/design/fonts";
import { addWorkingDays } from "@/lib/order/dates";
import { effectiveSizes, needsRoster } from "@/lib/order/roster";
import type { DesignSelection, PersonalStyle, PrintSelection } from "@/lib/pricing/types";
import type { OrderNote } from "@/server/orders";
import { artworkLine } from "./TeamOrderItems";
import { day, when } from "./ui";

const cm = (mm: number) => (mm / 10).toFixed(1);

/** A printable production sheet for the workshop: one section per design. */
export function WorkshopSheet({ order, notes, catalog }: { order: OrderView; notes: OrderNote[]; catalog: Catalog }) {
  const pieces = order.items.reduce((s, i) => s + i.quote.quantity, 0);
  const approvedAt = [...order.events].reverse().find((e) => e.type === "proofApproved")?.at;
  const readyBy = approvedAt ? day(addWorkingDays(new Date(approvedAt), order.workingDays, catalog.calendar)) : "after the proof is approved";
  const gov = catalog.governorates.find((g) => g.id === order.shipping.governorateId);
  const delivery =
    order.shipping.method === "pickup"
      ? "Pickup from the studio"
      : order.shipping.method === "school"
        ? `School / university: ${order.shipping.school}${gov ? `, ${tr(gov.name, "en")}` : ""}`
        : `Home delivery${gov ? `, ${tr(gov.name, "en")}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/orders/${order.code}`} className="inline-flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the order
        </Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-light">
          <Printer className="h-4 w-4" aria-hidden /> Print or save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] rounded-lg bg-white p-8 text-neutral-900 shadow-xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-neutral-900 pb-3">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] uppercase">Arcane Studios · Workshop sheet</p>
            <h1 className="font-display text-4xl tracking-wide uppercase">Order {order.code}</h1>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm">
            <dt className="text-neutral-500">Placed</dt>
            <dd>{when(order.createdAt)}</dd>
            <dt className="text-neutral-500">Ready by</dt>
            <dd className="font-semibold">{readyBy}</dd>
            <dt className="text-neutral-500">Pieces</dt>
            <dd className="font-semibold">{pieces}</dd>
            <dt className="text-neutral-500">Delivery</dt>
            <dd>{delivery}</dd>
          </dl>
        </header>

        {order.items.map((item, i) => (
          <ItemSection key={item.id} item={item} index={i} count={order.items.length} catalog={catalog} />
        ))}

        {order.notes || notes.length ? (
          <section className="mt-6 border-t border-neutral-300 pt-4 text-sm">
            <h2 className="font-bold uppercase">Notes</h2>
            {order.notes ? (
              <p className="mt-1 whitespace-pre-line" dir="auto">
                <span className="font-semibold">Customer: </span>
                {order.notes}
              </p>
            ) : null}
            {notes.map((n, i) => (
              <p key={i} className="mt-1 whitespace-pre-line" dir="auto">
                <span className="font-semibold">{n.author}: </span>
                {n.text}
              </p>
            ))}
          </section>
        ) : null}
      </article>
    </div>
  );
}

function ItemSection({ item, index, count, catalog }: { item: OrderItem; index: number; count: number; catalog: Catalog }) {
  const d = withFreePrints(catalog, item.design);
  const product = catalog.products.find((p) => p.id === d.productId);
  const fit = catalog.fits.find((f) => f.id === d.fitId);
  const fabric = product?.fabrics.find((f) => f.id === d.fabricId);
  const color = catalog.colors.find((c) => c.id === d.bodyColorId);
  const sizes = effectiveSizes(item.order, d.personalization);
  const people = needsRoster(d.personalization) ? item.order.roster : [];
  const sample = people.find((r) => r.name || r.number);
  const sizeOrder = catalog.sizes.map((s) => s.id);
  const p = d.personalization;
  const styles: [string, PersonalStyle | undefined][] = [
    ["Names", p.names ? p.nameStyle : undefined],
    ["Numbers", p.numbers ? p.numberStyle : undefined],
    ["Class names list", p.namesList ? p.namesListStyle : undefined],
  ];

  return (
    <section className={`mt-6 ${index > 0 ? "break-before-page" : ""}`}>
      <h2 className="border-b border-neutral-300 pb-1 text-lg font-bold">
        {count > 1 ? `Design ${index + 1} of ${count}: ` : ""}
        {product ? tr(product.name, "en") : d.productId}, {item.quote.quantity} pieces
      </h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_15rem]">
        <table className="text-sm">
          <tbody>
            {[
              ["Garment", product ? tr(product.name, "en") : d.productId],
              ["Sleeve", tr(sleeveLabels[d.sleeve], "en")],
              ["Fit", fit ? tr(fit.name, "en") : d.fitId],
              ["Fabric weight", `${d.gsm} GSM`],
              ["Fabric", fabric ? tr(fabric.name, "en") : d.fabricId],
            ].map(([k, v]) => (
              <tr key={k}>
                <th className="py-0.5 pe-4 text-start font-normal text-neutral-500">{k}</th>
                <td className="py-0.5 font-semibold">{v}</td>
              </tr>
            ))}
            <tr>
              <th className="py-0.5 pe-4 text-start font-normal text-neutral-500">Color</th>
              <td className="py-0.5 font-semibold">
                <span className="me-2 inline-block h-3.5 w-3.5 rounded-sm border border-neutral-400 align-[-2px]" style={{ background: color?.hex }} aria-hidden />
                {color ? `${tr(color.name, "en")} (${color.hex.toUpperCase()})` : d.bodyColorId}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-2">
          {(["front", "back"] as const).map((v) => (
            <GarmentImage
              key={v}
              catalog={catalog}
              design={d}
              view={v}
              width={300}
              height={340}
              samples={{ name: sample?.name || "NAME", number: sample?.number || "10" }}
              alt={`${v} view`}
              className="h-auto w-full"
            />
          ))}
        </div>
      </div>

      {d.prints.length ? (
        <div className="mt-4 space-y-4">
          {d.prints.map((print, i) => {
            const n = d.prints.slice(0, i + 1).filter((p) => p.areaId === print.areaId).length;
            return <PrintSection key={print.id} print={print} n={n} catalog={catalog} design={d} bodyHex={color?.hex ?? "#ffffff"} />;
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm">Blank: no prints.</p>
      )}

      {styles.some(([, s]) => s) || (p.neckLabel && p.neckLabelText) ? (
        <div className="mt-4 text-sm">
          <h3 className="font-bold uppercase">Personalization</h3>
          <ul className="mt-1 list-disc ps-5">
            {styles.map(([label, s]) =>
              s ? (
                <li key={label}>
                  {label}: {tr(catalog.printAreas.find((a) => a.id === s.areaId)?.name ?? { en: s.areaId, ar: s.areaId }, "en")} · {fontById(s.fontId).label} · {s.color.toUpperCase()}
                  {label === "Class names list" ? ` · ${p.namesListNames?.length ?? 0} names (list below)` : ` · letters ${cm(s.sizeMm)} cm`}
                </li>
              ) : null,
            )}
            {p.neckLabel && p.neckLabelText ? <li>Neck label: “{p.neckLabelText}”</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 text-sm">
        <h3 className="font-bold uppercase">Sizes</h3>
        <table className="mt-1 border-collapse text-center">
          <thead>
            <tr>
              {catalog.sizes
                .filter((s) => (sizes[s.id] ?? 0) > 0)
                .map((s) => (
                  <th key={s.id} className="border border-neutral-400 px-3 py-1 font-semibold">
                    {s.label}
                  </th>
                ))}
              <th className="border border-neutral-400 bg-neutral-100 px-3 py-1 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {catalog.sizes
                .filter((s) => (sizes[s.id] ?? 0) > 0)
                .map((s) => (
                  <td key={s.id} className="border border-neutral-400 px-3 py-1">
                    {sizes[s.id]}
                  </td>
                ))}
              <td className="border border-neutral-400 bg-neutral-100 px-3 py-1 font-bold">{item.quote.quantity}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {people.length ? (
        <div className="mt-4 text-sm">
          <h3 className="font-bold uppercase">Pieces by person ({people.length})</h3>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="text-start">
                <th className="border border-neutral-400 px-2 py-1 text-start">#</th>
                <th className="border border-neutral-400 px-2 py-1 text-start">Size</th>
                <th className="border border-neutral-400 px-2 py-1 text-start">Name</th>
                {p.numbers ? <th className="border border-neutral-400 px-2 py-1 text-start">Number</th> : null}
                <th className="border border-neutral-400 px-2 py-1 text-start">Done</th>
              </tr>
            </thead>
            <tbody>
              {[...people]
                .sort((a, b) => sizeOrder.indexOf(a.sizeId) - sizeOrder.indexOf(b.sizeId) || a.name.localeCompare(b.name))
                .map((r, i) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className="border border-neutral-400 px-2 py-1 text-neutral-500">{i + 1}</td>
                    <td className="border border-neutral-400 px-2 py-1 font-semibold">{catalog.sizes.find((s) => s.id === r.sizeId)?.label ?? r.sizeId}</td>
                    <td className="border border-neutral-400 px-2 py-1" dir="auto">
                      {r.name}
                    </td>
                    {p.numbers ? <td className="border border-neutral-400 px-2 py-1">{r.number}</td> : null}
                    <td className="w-12 border border-neutral-400 px-2 py-1" />
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {p.namesList && p.namesListNames?.length ? (
        <div className="mt-4 text-sm">
          <h3 className="font-bold uppercase">Class names list ({p.namesListNames.length}), printed on every piece</h3>
          <p className="mt-1 columns-2 sm:columns-3" dir="auto">
            {p.namesListNames.map((n, i) => (
              <span key={i} className="block">
                {n}
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** One print: where it goes on its side, its size, and a to-scale flat drawing of the side with it in place. */
function PrintSection({ print, n, catalog, design, bodyHex }: { print: PrintSelection; n: number; catalog: Catalog; design: DesignSelection; bodyHex: string }) {
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  const product = catalog.products.find((p) => p.id === design.productId);
  const measurements = useMeasureStore((s) => s.measurements);
  const elements = print.elements ?? [];
  if (!product || !isPrintSide(print.areaId)) return null;
  const side = print.areaId;
  const panel = panelBox(product.mockup, design.sleeve, side);
  const bounds = printBounds(elements, measurements);
  const where = bounds ? placeRect(product.mockup, design.sleeve, side, bounds) : null;
  const name = `${tr(sideNames[side], "en")}${n > 1 ? ` ${n}` : ""}`;

  return (
    <div className="break-inside-avoid rounded border border-neutral-300 p-3">
      <h3 className="font-bold">
        {name} · {method ? tr(method.name, "en") : print.methodId} · {tr(tierLabels[print.tier], "en")}
        {print.colorCount ? ` · ${print.colorCount} colors` : ""}
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <ul className="space-y-1 text-sm">
          {where && bounds ? (
            <>
              <li>{rectPlacementText(where)}</li>
              <li>
                Print size: <span className="font-semibold">{cm(bounds.w)} × {cm(bounds.h)} cm</span>
              </li>
            </>
          ) : (
            <li>No artwork in this print.</li>
          )}
          {elements.map((el) => (
            <li key={el.id} className="text-neutral-600" dir="auto">
              {artworkLine(el)}
            </li>
          ))}
        </ul>
        <svg viewBox={`${-panel.w * 0.06} ${-panel.h * 0.04} ${panel.w * 1.12} ${panel.h * 1.08}`} className="w-full rounded" style={{ background: bodyHex }} role="img" aria-label={`Flat drawing of the ${name} print`}>
          <rect x={0} y={0} width={panel.w} height={panel.h} fill="none" stroke="#888" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          {bounds ? <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="none" stroke="#c9a227" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /> : null}
          {elements.map((el) => (
            <g key={el.id} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}>
              <ElementShape el={el} missingLabel="Image missing" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
