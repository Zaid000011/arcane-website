"use client";

import { ClipboardPaste, FileUp, Minus, Plus, Ruler, Trash2, UserPlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { useDesignStore } from "@/lib/design/store";
import { newElementId } from "@/lib/design/types";
import { addWorkingDays, formatDate } from "@/lib/order/dates";
import { effectiveSizes, needsRoster, parseRosterText, totalPieces } from "@/lib/order/roster";
import type { OrderDraft, RosterEntry } from "@/lib/order/types";
import type { Quote } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";
import { FieldLabel } from "./controls";
import { SendItButton, type PanelProps } from "./panels";

const MAX_ROWS = 500;

export function SizesPanel({ catalog, design, quote, onSendSize }: Omit<PanelProps, "update" | "product"> & { quote: Quote; onSendSize: () => void }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const order = useDesignStore((s) => s.order);
  const setOrder = useDesignStore((s) => s.setOrder);
  const roster = needsRoster(design.personalization);
  const sizes = effectiveSizes(order, design.personalization);
  const pieces = totalPieces(sizes);

  // Extra production days from slower print methods apply to every speed.
  const extraDays = useMemo(
    () => Math.max(0, ...design.prints.map((p) => catalog.printMethods.find((m) => m.id === p.methodId)?.extraDays ?? 0)),
    [catalog, design.prints],
  );
  const today = useMemo(() => new Date(), []);

  return (
    <div className="space-y-8">
      <section>
        <FieldLabel hint={fmt(t.piecesTotal, { count: pieces })}>{t.sizesTitle}</FieldLabel>
        <p className="mb-4 text-sm text-cream-muted">{roster ? t.rosterIntro : t.sizesIntro}</p>
        {roster ? (
          <RosterEditor catalog={catalog} order={order} setOrder={setOrder} showName={design.personalization.names} showNumber={design.personalization.numbers} />
        ) : (
          <SizeGrid catalog={catalog} order={order} setOrder={setOrder} />
        )}
        <SendItButton icon={Ruler} onClick={onSendSize}>
          {dict.send.sizeButton}
        </SendItButton>
        {roster && pieces > 0 ? (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {catalog.sizes
              .filter((s) => sizes[s.id])
              .map((s) => (
                <span key={s.id} className="rounded-full border border-line px-2.5 py-1 text-xs text-cream" dir="ltr">
                  {s.label} × {sizes[s.id]}
                </span>
              ))}
          </p>
        ) : null}
      </section>

      <section>
        <FieldLabel>{t.deliveryTitle}</FieldLabel>
        <div className="grid gap-2">
          {catalog.deliverySpeeds.map((speed) => {
            const fee = speed.percent > 0 && quote.subtotal > 0 ? Math.max(Math.round((quote.subtotal * speed.percent) / 100), speed.minFee) : 0;
            const date = addWorkingDays(today, speed.workingDays + extraDays, catalog.calendar);
            const selected = order.deliverySpeedId === speed.id;
            return (
              <button
                key={speed.id}
                type="button"
                aria-pressed={selected}
                disabled={!speed.enabled}
                onClick={() => setOrder({ ...order, deliverySpeedId: speed.id })}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-start transition-colors hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-gold aria-pressed:bg-gold/10"
              >
                <span>
                  <span className="block font-semibold text-cream">{tr(speed.name, locale)}</span>
                  <span className="text-xs text-cream-muted">
                    {speed.enabled ? `${tr(speed.description, locale)} · ${fmt(t.estimatedDelivery, { date: formatDate(date, locale) })}` : t.unavailable}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-gold">
                  {speed.percent === 0
                    ? t.feeFree
                    : fee > 0
                      ? `+${formatMoney(fee, locale)}`
                      : `+${speed.percent}% · min ${formatMoney(speed.minFee, locale)}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SizeGrid({ catalog, order, setOrder }: { catalog: Catalog; order: OrderDraft; setOrder: (o: OrderDraft) => void }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const set = (sizeId: string, value: number) => {
    const n = Math.max(0, Math.min(9999, Math.floor(Number.isFinite(value) ? value : 0)));
    const sizes = { ...order.sizes, [sizeId]: n };
    if (!n) delete sizes[sizeId];
    setOrder({ ...order, sizes });
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {catalog.sizes.map((size) => {
        const qty = order.sizes[size.id] ?? 0;
        return (
          <div key={size.id} className={`rounded-xl border p-3 ${qty ? "border-gold/60 bg-gold/5" : "border-line"}`}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-semibold text-cream" dir="ltr">{size.label}</span>
              {size.surcharge > 0 ? <span className="text-[11px] text-gold">+{formatMoney(size.surcharge, locale)}</span> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label={`${t.fewer} ${size.label}`} onClick={() => set(size.id, qty - 1)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line hover:border-gold">
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={qty || ""}
                placeholder="0"
                aria-label={size.label}
                onChange={(e) => set(size.id, Number(e.target.value))}
                className="h-9 w-full min-w-0 rounded-lg border border-line bg-ink text-center text-cream [appearance:textfield] focus:border-gold focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button type="button" aria-label={`${t.more} ${size.label}`} onClick={() => set(size.id, qty + 1)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line hover:border-gold">
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RosterEditor({
  catalog,
  order,
  setOrder,
  showName,
  showNumber,
}: {
  catalog: Catalog;
  order: OrderDraft;
  setOrder: (o: OrderDraft) => void;
  showName: boolean;
  showNumber: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.designer;
  const sizes = catalog.sizes;
  const [pasteOpen, setPasteOpen] = useState(order.roster.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastAddedRef = useRef<string | null>(null);

  const setRows = (roster: RosterEntry[]) => setOrder({ ...order, roster: roster.slice(0, MAX_ROWS) });
  const setRow = (id: string, patch: Partial<RosterEntry>) => setRows(order.roster.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const append = (rows: RosterEntry[]) => {
    setRows([...order.roster, ...rows]);
    setMessage(rows.length ? fmt(t.addedRows, { count: rows.length }) : t.nothingFound);
  };

  const addFromText = (text: string) => append(parseRosterText(text, catalog));

  return (
    <div className="space-y-3">
      {order.roster.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="hidden grid-cols-[2rem_1fr_5rem_6rem_2.25rem] gap-2 bg-wine-deep/70 px-3 py-2 text-xs font-semibold text-cream-muted sm:grid" aria-hidden>
            <span>#</span>
            <span>{showName ? t.name : ""}</span>
            <span>{showNumber ? t.number : ""}</span>
            <span>{t.sizeColumn}</span>
            <span />
          </div>
          <ol className="divide-y divide-line">
            {order.roster.map((row, i) => (
              <li key={row.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[2rem_1fr_5rem_6rem_2.25rem]">
                <span className="text-xs text-cream-muted">{i + 1}</span>
                {showName ? (
                  <input
                    ref={(el) => {
                      if (el && lastAddedRef.current === row.id) {
                        el.focus();
                        lastAddedRef.current = null;
                      }
                    }}
                    type="text"
                    value={row.name}
                    maxLength={40}
                    dir="auto"
                    aria-label={`${t.name} ${i + 1}`}
                    onChange={(e) => setRow(row.id, { name: e.target.value })}
                    className={`h-9 min-w-0 rounded-lg border bg-ink px-2.5 text-sm text-cream focus:border-gold focus:outline-none ${row.name.trim() ? "border-line" : "border-arcane-bright/70"}`}
                  />
                ) : (
                  <span />
                )}
                <div className="col-span-3 col-start-2 flex items-center gap-2 sm:contents">
                  {showNumber ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.number}
                      maxLength={3}
                      aria-label={`${t.number} ${i + 1}`}
                      onChange={(e) => setRow(row.id, { number: e.target.value.replace(/[^0-9]/g, "") })}
                      className={`h-9 w-16 rounded-lg border bg-ink px-2.5 text-center text-sm text-cream focus:border-gold focus:outline-none sm:w-auto ${row.number ? "border-line" : "border-arcane-bright/70"}`}
                    />
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <select
                    value={row.sizeId}
                    aria-label={`${t.sizeColumn} ${i + 1}`}
                    onChange={(e) => setRow(row.id, { sizeId: e.target.value })}
                    className={`h-9 flex-1 rounded-lg border bg-ink px-2 text-sm text-cream focus:border-gold focus:outline-none ${row.sizeId ? "border-line" : "border-arcane-bright/70"}`}
                  >
                    <option value="">{t.chooseSize}</option>
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={fmt(t.removePerson, { name: row.name || String(i + 1) })}
                    onClick={() => setRows(order.roster.filter((r) => r.id !== row.id))}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-cream-muted hover:bg-arcane hover:text-cream"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const row: RosterEntry = { id: newElementId(), name: "", number: "", sizeId: "" };
            lastAddedRef.current = row.id;
            setRows([...order.roster, row]);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 px-3 py-2 text-sm font-semibold text-cream hover:border-gold hover:bg-gold/10"
        >
          <UserPlus className="h-4 w-4" aria-hidden /> {t.addPerson}
        </button>
        <button
          type="button"
          aria-expanded={pasteOpen}
          onClick={() => setPasteOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream-muted hover:border-gold hover:text-cream"
        >
          <ClipboardPaste className="h-4 w-4" aria-hidden /> {t.pasteList}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream-muted hover:border-gold hover:text-cream">
          <FileUp className="h-4 w-4" aria-hidden /> {t.uploadCsv}
        </button>
        {order.roster.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t.clearConfirm)) setRows([]);
            }}
            className="ms-auto rounded-lg px-3 py-2 text-sm text-cream-muted hover:text-arcane-bright"
          >
            {t.clearRoster}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-label={t.uploadCsv}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) addFromText(await file.text());
            e.target.value = "";
          }}
        />
      </div>

      {pasteOpen ? (
        <div className="space-y-2 rounded-xl border border-line bg-ink/50 p-3">
          <p className="text-xs text-cream-muted">{t.pasteHint}</p>
          <textarea
            value={pasteText}
            rows={5}
            dir="auto"
            placeholder={t.pastePlaceholder}
            onChange={(e) => setPasteText(e.target.value)}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              addFromText(pasteText);
              setPasteText("");
            }}
            className="btn btn-primary px-4 py-2"
          >
            {t.addFromList}
          </button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-gold-light">
          {message}
        </p>
      ) : null}
    </div>
  );
}

