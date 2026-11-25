"use client";

import { Download } from "lucide-react";
import { GarmentImage } from "@/components/three/GarmentImage";
import { tierLabels, tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import type { OrderItem } from "@/lib/checkout/types";
import { clipartById } from "@/lib/design/clipart";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { withFreePrints } from "@/lib/design/logic";
import { isPrintSide, sideNames } from "@/lib/design/sides";
import { fontById } from "@/lib/design/fonts";
import { imageDpi } from "@/lib/design/geometry";
import type { DesignElement } from "@/lib/design/types";
import { effectiveSizes, needsRoster } from "@/lib/order/roster";
import { en } from "@/i18n/dictionaries/en";
import { money, Panel, smallButton } from "./ui";

/** One line per piece of artwork, with what the workshop needs to know. */
export function artworkLine(el: DesignElement): string {
  if (el.type === "text") return `Text “${el.text}” · ${fontById(el.fontId).label} · ${el.color.toUpperCase()} · letters about ${(el.size / 10).toFixed(1)} cm`;
  if (el.type === "image") {
    const h = el.w * el.aspect;
    return `Image ${el.name} · ${(el.w / 10).toFixed(1)} × ${(h / 10).toFixed(1)} cm · ${Math.round(imageDpi(el))} DPI`;
  }
  const art = clipartById(el.clipartId);
  return `Clip-art ${art ? art.name.en : el.clipartId} · ${(el.w / 10).toFixed(1)} cm · ${el.color.toUpperCase()}`;
}

/** Names and sizes as a spreadsheet, sorted by size then name (UTF-8 with BOM so Excel shows Arabic names). */
export function downloadPeopleCsv(catalog: Catalog, code: string, index: number, item: OrderItem) {
  const order = catalog.sizes.map((s) => s.id);
  const label = (id: string) => catalog.sizes.find((s) => s.id === id)?.label ?? id;
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  let rows: string[];
  if (needsRoster(item.design.personalization)) {
    const people = [...item.order.roster].sort((a, b) => order.indexOf(a.sizeId) - order.indexOf(b.sizeId) || a.name.localeCompare(b.name));
    rows = [["Size", "Name", "Number"].map(cell).join(","), ...people.map((p) => [label(p.sizeId), p.name, p.number].map(cell).join(","))];
  } else {
    rows = [["Size", "Pieces"].map(cell).join(","), ...order.filter((id) => (item.order.sizes[id] ?? 0) > 0).map((id) => [label(id), item.order.sizes[id]!].map(cell).join(","))];
  }
  const blob = new Blob([`﻿${rows.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `order-${code}-item-${index + 1}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TeamOrderItems({ code, items, catalog }: { code: string; items: OrderItem[]; catalog: Catalog }) {
  return (
    <Panel title={`What was ordered (${items.length} ${items.length === 1 ? "design" : "designs"})`}>
      <ul className="space-y-6">
        {items.map((item, index) => {
          const info = describeDesign(catalog, item.design, "en", en.designer);
          const sizes = effectiveSizes(item.order, item.design.personalization);
          const people = needsRoster(item.design.personalization) ? item.order.roster : [];
          const sample = people.find((r) => r.name || r.number);
          const p = item.design.personalization;
          return (
            <li key={item.id} className="grid gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0 md:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="grid grid-cols-2 gap-2 self-start">
                {(["front", "back"] as const).map((v) => (
                  <GarmentImage
                    key={v}
                    catalog={catalog}
                    design={item.design}
                    view={v}
                    width={300}
                    height={340}
                    samples={{ name: sample?.name || "NAME", number: sample?.number || "10" }}
                    alt={`${info.garment}, ${v}`}
                    className="h-auto w-full rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.12),transparent_65%)]"
                  />
                ))}
              </div>
              <div className="min-w-0 space-y-3 text-sm">
                <div>
                  <p className="font-serif text-base font-bold text-cream">{info.garment}</p>
                  <p className="text-cream-muted">{info.colors.join(" · ")}</p>
                </div>
                {item.design.prints.length ? (
                  <ul className="space-y-2">
                    {withFreePrints(catalog, item.design).prints.map((print, i, all) => {
                      const n = all.slice(0, i + 1).filter((p) => p.areaId === print.areaId).length;
                      const side = isPrintSide(print.areaId) ? tr(sideNames[print.areaId], "en") : print.areaId;
                      const method = catalog.printMethods.find((m) => m.id === print.methodId);
                      return (
                        <li key={print.id} className="rounded-lg bg-ink px-3 py-2">
                          <p className="font-semibold text-cream">
                            {n > 1 ? `${side} ${n}` : side} · {method ? tr(method.name, "en") : print.methodId} · {tr(tierLabels[print.tier], "en")}
                            {print.colorCount ? ` · ${print.colorCount} colors` : ""}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-cream-muted">
                            {(print.elements ?? []).map((el) => (
                              <li key={el.id} className="flex flex-wrap items-center gap-2">
                                <span dir="auto">{artworkLine(el)}</span>
                                {el.type === "image" ? (
                                  <a href={`/api/assets/${el.assetId}`} download={el.name} className="inline-flex items-center gap-1 text-gold hover:underline">
                                    <Download className="h-3.5 w-3.5" aria-hidden /> Download original
                                  </a>
                                ) : null}
                              </li>
                            ))}
                            {(print.elements ?? []).length === 0 ? <li>No artwork in this area.</li> : null}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-cream-muted">Blank (no prints).</p>
                )}
                {info.personalization.length ? <p className="text-cream-muted">Personalized: {info.personalization.join(" · ")}</p> : null}
                {p.neckLabel && p.neckLabelText ? <p className="text-cream-muted">Neck label text: “{p.neckLabelText}”</p> : null}
                <div>
                  <p className="text-cream">
                    {item.quote.quantity} pieces · <span dir="ltr">{describeSizes(catalog, sizes)}</span>
                  </p>
                  {people.length ? <p className="text-cream-muted">{people.length} names and sizes, one per piece.</p> : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2">
                  <button type="button" onClick={() => downloadPeopleCsv(catalog, code, index, item)} className={smallButton}>
                    <Download className="h-4 w-4" aria-hidden /> {people.length ? "Download names and sizes (CSV)" : "Download sizes (CSV)"}
                  </button>
                  <span className="font-semibold text-gold">{money(item.quote.total)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
