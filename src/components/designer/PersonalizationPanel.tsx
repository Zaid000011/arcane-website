"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isLightHex } from "@/components/garment/color";
import { areaSide } from "@/lib/design/areas";
import { tr } from "@/lib/catalog";
import { designFonts, fontById } from "@/lib/design/fonts";
import { placementsFor, styleKey, togglePersonal, type PersonalKind } from "@/lib/design/personalization";
import { useDesignStore } from "@/lib/design/store";
import { parseNamesList } from "@/lib/order/roster";
import type { PersonalStyle } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";
import { FieldLabel, Swatch } from "./controls";
import type { PanelProps } from "./panels";

export function PersonalizationPanel({ catalog, design, product, update }: PanelProps) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const setView = useDesignStore((s) => s.setView);
  const p = design.personalization;
  const fees = catalog.personalization;
  const money = (n: number) => formatMoney(n, locale);
  const bodyHex = catalog.colors.find((c) => c.id === design.bodyColorId)?.hex ?? "#151515";
  const ink = isLightHex(bodyHex) ? "#151515" : "#F5EBD8";

  const showArea = (areaId: string | undefined) => {
    if (areaId) setView(areaSide(areaId));
  };

  const toggle = (kind: PersonalKind, on: boolean) => {
    const next = togglePersonal(product, design, kind, on, ink);
    update(next);
    if (on) showArea(next.personalization[styleKey(kind)]?.areaId);
  };

  const setStyle = (kind: PersonalKind, patch: Partial<PersonalStyle>, coalesce?: string) => {
    const key = styleKey(kind);
    const current = p[key];
    if (!current) return;
    update({ ...design, personalization: { ...p, [key]: { ...current, ...patch } } }, coalesce);
    if (patch.areaId) showArea(patch.areaId);
  };

  return (
    <div className="space-y-4">
      <FieldLabel>{t.namesTitle}</FieldLabel>
      <p className="text-sm text-cream-muted">{t.namesIntro}</p>

      <OptionCard title={t.nameOption} fee={fmt(t.perPieceFee, { fee: money(fees.name.perPiece) })} checked={p.names} onToggle={(on) => toggle("name", on)}>
        {p.nameStyle ? <StyleEditor catalog={catalog} kind="name" style={p.nameStyle} placements={placementsFor("name", product)} onChange={(patch, c) => setStyle("name", patch, c)} sizeRange={[20, 100]} /> : null}
      </OptionCard>

      <OptionCard title={t.numberOption} fee={fmt(t.perPieceFee, { fee: money(fees.number.perPiece) })} checked={p.numbers} onToggle={(on) => toggle("number", on)}>
        {p.numberStyle ? <StyleEditor catalog={catalog} kind="number" style={p.numberStyle} placements={placementsFor("number", product)} onChange={(patch, c) => setStyle("number", patch, c)} sizeRange={[40, 300]} /> : null}
      </OptionCard>

      <OptionCard
        title={t.namesListOption}
        fee={fmt(t.perPieceAndSetup, { fee: money(fees.namesList.perPiece), setup: money(fees.namesList.setupFee) })}
        checked={p.namesList}
        onToggle={(on) => toggle("namesList", on)}
        disabled={placementsFor("namesList", product).length === 0}
      >
        <NamesListEditor
          names={p.namesListNames ?? []}
          max={fees.namesList.maxNames}
          onChange={(names) => update({ ...design, personalization: { ...p, namesListNames: names, namesListCount: names.length } }, "namesList")}
        />
        {p.namesListStyle ? <StyleEditor catalog={catalog} kind="namesList" style={p.namesListStyle} placements={placementsFor("namesList", product)} onChange={(patch, c) => setStyle("namesList", patch, c)} /> : null}
      </OptionCard>

      <OptionCard
        title={t.neckLabelOption}
        fee={fmt(t.perPieceAndSetup, { fee: money(fees.neckLabel.perPiece), setup: money(fees.neckLabel.setupFee) })}
        checked={p.neckLabel}
        onToggle={(on) => {
          update({ ...design, personalization: { ...p, neckLabel: on } });
          if (on) setView("front");
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{t.neckLabelText}</span>
          <input
            type="text"
            value={p.neckLabelText ?? ""}
            maxLength={24}
            dir="auto"
            placeholder={t.neckLabelPlaceholder}
            onChange={(e) => update({ ...design, personalization: { ...p, neckLabelText: e.target.value } }, "neckLabel")}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none"
          />
        </label>
      </OptionCard>
    </div>
  );
}

function StyleEditor({
  catalog,
  kind,
  style,
  placements,
  onChange,
  sizeRange,
}: {
  catalog: PanelProps["catalog"];
  kind: PersonalKind;
  style: PersonalStyle;
  placements: string[];
  onChange: (patch: Partial<PersonalStyle>, coalesce?: string) => void;
  sizeRange?: [number, number];
}) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  return (
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-cream-muted">{t.placement}</p>
          <div className="flex flex-wrap gap-1.5">
            {placements.map((id) => {
              const area = catalog.printAreas.find((a) => a.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={style.areaId === id}
                  onClick={() => onChange({ areaId: id })}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-cream-muted aria-pressed:border-gold aria-pressed:bg-gold/10 aria-pressed:text-cream"
                >
                  {area ? tr(area.name, locale) : id}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{t.font}</span>
          <select
            value={style.fontId}
            onChange={(e) => onChange({ fontId: e.target.value })}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-cream focus:border-gold focus:outline-none"
            style={{ fontFamily: fontById(style.fontId).family }}
          >
            <optgroup label={t.latinFonts}>
              {designFonts.filter((f) => f.script === "latin").map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
            <optgroup label={t.arabicFonts}>
              {designFonts.filter((f) => f.script === "arabic").map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-cream-muted">{t.color}</p>
          <div className="flex flex-wrap gap-2">
            {catalog.colors.filter((c) => c.inStock).map((c) => (
              <Swatch key={c.id} size="sm" hex={c.hex} label={`${tr(c.name, locale)} · ${c.hex.toUpperCase()}`} selected={style.color.toLowerCase() === c.hex.toLowerCase()} onSelect={() => onChange({ color: c.hex })} />
            ))}
          </div>
        </div>
        {sizeRange ? (
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs">
              <span className="font-semibold text-cream-muted">{t.size}</span>
              <span className="text-cream">{fmt(t.sizeValue, { cm: (style.sizeMm / 10).toFixed(1) })}</span>
            </span>
            <input
              type="range"
              min={sizeRange[0]}
              max={sizeRange[1]}
              step={5}
              value={style.sizeMm}
              aria-label={`${t.size} · ${kind}`}
              onChange={(e) => onChange({ sizeMm: Number(e.target.value) }, `style-size-${kind}`)}
              className="w-full accent-[#C9A227]"
            />
          </label>
        ) : null}
      </div>
    );
}

function OptionCard({
  title,
  fee,
  checked,
  onToggle,
  disabled,
  children,
}: {
  title: string;
  fee: string;
  checked: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border p-4 transition-colors ${checked ? "border-gold/60 bg-gold/5" : "border-line"} ${disabled ? "opacity-50" : ""}`}>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block font-semibold text-cream">{title}</span>
          <span className="text-xs text-gold">{fee}</span>
        </span>
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className="relative mt-1 inline-block h-6 w-11 shrink-0 rounded-full bg-ink-2 ring-1 ring-line transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold-light after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-cream after:transition-transform peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
        />
      </label>
      {checked && children ? <div className="mt-4 space-y-4 border-t border-line pt-4">{children}</div> : null}
    </section>
  );
}

function NamesListEditor({ names, max, onChange }: { names: string[]; max: number; onChange: (names: string[]) => void }) {
  const { dict } = useI18n();
  const t = dict.designer;
  const [text, setText] = useState(() => names.join("\n"));

  // Follow outside changes (undo/redo) without fighting the user's typing.
  useEffect(() => {
    if (parseNamesList(text).join("\n") !== names.join("\n")) setText(names.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);

  const over = names.length > max;
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs">
        <span className="font-semibold text-cream-muted">{t.namesListLabel}</span>
        <span className={over ? "text-arcane-bright" : "text-cream"}>{fmt(t.namesListCount, { count: names.length, max })}</span>
      </span>
      <textarea
        value={text}
        rows={6}
        dir="auto"
        placeholder={t.namesListPlaceholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNamesList(e.target.value));
        }}
        className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none"
      />
    </label>
  );
}
