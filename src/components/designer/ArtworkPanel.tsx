"use client";

import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowDown,
  ArrowUp,
  Copy,
  Eraser,
  ImagePlus,
  Lock,
  LockOpen,
  Shapes,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { isLightHex } from "@/components/garment/color";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { getAsset, putAsset, useAssetUrl } from "@/lib/design/assets";
import { clipartById, clipartLibrary } from "@/lib/design/clipart";
import {
  addElement,
  boxFor,
  defaultClassText,
  duplicateElement,
  moveLayer,
  newClipartElement,
  newImageElement,
  newTextElement,
  removeElement,
  updateElement,
} from "@/lib/design/elements";
import { defaultFontFor, designFonts, fontById, hasArabic } from "@/lib/design/fonts";
import { dpiLevel, elementBBox, imageDpi, measuredFor, MIN_SIZE_MM, rotatedExtents } from "@/lib/design/geometry";
import { checkUpload, readImageInfo, removeBackground } from "@/lib/design/image-tools";
import { useMeasureStore } from "@/lib/design/measure-store";
import { useDesignStore } from "@/lib/design/store";
import { newElementId, type DesignElement, type ImageElement } from "@/lib/design/types";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { Swatch } from "./controls";
import { SideEditor } from "./SideEditor";
import { bodyHex as bodyColorHex } from "@/lib/design/options";

function elementLabel(el: DesignElement, t: { textLayer: string; imageLayer: string; clipartLayer: string }): string {
  if (el.type === "text") return el.text || t.textLayer;
  if (el.type === "image") return el.name || t.imageLayer;
  return t.clipartLayer;
}

type Update = (next: DesignSelection, coalesce?: string) => void;

export function ArtworkPanel({ catalog, design, print, update }: { catalog: Catalog; design: DesignSelection; print: PrintSelection; update: Update }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const box = boxFor(catalog, design, print) ?? { w: 100, h: 100 };
  const elements = print.elements ?? [];
  const selected = selection?.printId === print.id && selection.elementId ? elements.find((e) => e.id === selection.elementId) : undefined;
  const [showClipart, setShowClipart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const quickText = useRef<HTMLInputElement>(null);
  const bodyHex = bodyColorHex(catalog, design);
  const ink = isLightHex(bodyHex) ? "#151515" : "#F5EBD8";

  const add = (el: DesignElement) => {
    update(addElement(catalog, design, print.id, el));
    select({ printId: print.id, elementId: el.id });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const problem = checkUpload(file);
    if (problem) {
      setError(t.uploadErrors[problem]);
      return;
    }
    setBusy(true);
    try {
      const info = await readImageInfo(file);
      const assetId = newElementId();
      await putAsset(assetId, file);
      add(newImageElement(box, { assetId, name: file.name, ...info }));
    } catch {
      setError(t.uploadErrors.unreadable);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <p className="text-xs font-semibold text-cream-muted">{t.artwork}</p>
      <SideEditor catalog={catalog} design={design} print={print} bodyHex={bodyHex} onEditText={() => quickText.current?.focus()} />
      {selected?.type === "text" ? (
        <label className="flex items-center gap-2 rounded-xl border border-gold/60 bg-ink/70 px-3 py-2 focus-within:border-gold">
          <Type className="h-4 w-4 shrink-0 text-gold" aria-hidden />
          <span className="shrink-0 text-xs font-semibold text-cream-muted">{t.editText}</span>
          <input
            ref={quickText}
            type="text"
            value={selected.text}
            maxLength={60}
            dir="auto"
            onChange={(e) => {
              const text = e.target.value;
              const switchToArabic = hasArabic(text) && fontById(selected.fontId).script === "latin";
              update(
                updateElement(catalog, design, print.id, selected.id, { text, ...(switchToArabic ? { fontId: "cairo" } : {}) }, useMeasureStore.getState().measurements[selected.id]),
                `text:${selected.id}`,
              );
            }}
            className="min-w-0 flex-1 bg-transparent py-1 text-cream focus:outline-none"
          />
        </label>
      ) : elements.some((e) => e.type === "text") ? (
        <p className="text-xs text-cream-muted">{t.editTextHint}</p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <ToolButton onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" aria-hidden />} label={busy ? t.adding : t.uploadImage} />
        <ToolButton
          onClick={() => {
            const text = defaultClassText(locale);
            add(newTextElement(box, text, defaultFontFor(text), ink));
          }}
          icon={<Type className="h-4 w-4" aria-hidden />}
          label={t.addText}
        />
        <ToolButton onClick={() => setShowClipart((v) => !v)} pressed={showClipart} icon={<Shapes className="h-4 w-4" aria-hidden />} label={t.addClipart} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.uploadImage}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <p className="text-xs text-cream-muted">{t.uploadHint}</p>
      {error ? (
        <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
          {error}
        </p>
      ) : null}

      {showClipart ? (
        <div className="grid grid-cols-6 gap-1.5 rounded-xl border border-line bg-ink/60 p-2 sm:grid-cols-8">
          {clipartLibrary.map((c) => (
            <button
              key={c.id}
              type="button"
              title={tr(c.name, locale)}
              aria-label={tr(c.name, locale)}
              onClick={() => {
                add(newClipartElement(box, c.id, ink));
                setShowClipart(false);
              }}
              className="flex aspect-square items-center justify-center rounded-lg border border-transparent hover:border-gold/60 hover:bg-gold/10"
            >
              <svg viewBox="-0.6 -0.6 1.2 1.2" className="h-7 w-7" aria-hidden>
                {c.render("#E2C766")}
              </svg>
            </button>
          ))}
        </div>
      ) : null}

      {elements.length === 0 ? (
        <p className="text-sm text-cream-muted">{t.emptyArtwork}</p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold text-cream-muted">{t.layers}</p>
          <ul className="space-y-1.5">
            {[...elements].reverse().map((el) => (
              <li key={el.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === el.id}
                  onClick={() => select({ printId: print.id, elementId: el.id })}
                  className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-start text-sm text-cream-muted transition-colors hover:border-gold/50 aria-pressed:border-gold aria-pressed:bg-gold/10 aria-pressed:text-cream"
                >
                  {el.type === "text" ? <Type className="h-4 w-4 shrink-0" aria-hidden /> : el.type === "image" ? <ImagePlus className="h-4 w-4 shrink-0" aria-hidden /> : <Shapes className="h-4 w-4 shrink-0" aria-hidden />}
                  <span className="truncate" dir="auto">
                    {el.type === "clipart" ? tr(clipartById(el.clipartId)?.name ?? { en: t.clipartLayer, ar: t.clipartLayer }, locale) : elementLabel(el, t)}
                  </span>
                  {el.locked ? <Lock className="ms-auto h-3.5 w-3.5 shrink-0 text-gold" aria-label={t.lock} /> : null}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-cream-muted">{t.selectHint}</p>
        </div>
      )}

      {selected ? <ElementEditor key={selected.id} catalog={catalog} design={design} print={print} el={selected} update={update} /> : null}
    </div>
  );
}

function ToolButton({ icon, label, onClick, pressed }: { icon: ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-1 rounded-xl border border-gold/40 px-2 py-2.5 text-xs font-semibold text-cream transition-colors hover:border-gold hover:bg-gold/10 aria-pressed:border-gold aria-pressed:bg-gold/15"
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------- Selected element ---------- */

function ElementEditor({ catalog, design, print, el, update }: { catalog: Catalog; design: DesignSelection; print: PrintSelection; el: DesignElement; update: Update }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const select = useDesignStore((s) => s.select);
  const measurement = useMeasureStore((s) => s.measurements[el.id]);
  const box = boxFor(catalog, design, print) ?? { w: 100, h: 100 };
  const colors = catalog.colors.filter((c) => c.inStock);
  const set = (patch: Partial<DesignElement>, coalesce?: string) =>
    update(updateElement(catalog, design, print.id, el.id, patch, measurement), coalesce ? `${coalesce}:${el.id}` : undefined);

  const center = (axis: "x" | "y") => {
    const ext = rotatedExtents(elementBBox(el, measuredFor(el, measurement)), el.rotation);
    if (axis === "x") set({ x: box.w / 2 - (ext.minX + ext.maxX) / 2 });
    else set({ y: box.h / 2 - (ext.minY + ext.maxY) / 2 });
  };

  const sizeValue = el.type === "text" ? el.size : el.w;
  const maxSize = el.type === "text" ? Math.max(MIN_SIZE_MM + 1, Math.min(box.h, 300)) : Math.max(MIN_SIZE_MM + 1, Math.max(box.w, box.h));

  return (
    <div className="space-y-5 rounded-xl border border-gold/40 bg-ink/50 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <SmallButton label={t.duplicate} onClick={() => {
          const r = duplicateElement(catalog, design, print.id, el.id);
          update(r.design);
          if (r.newId) select({ printId: print.id, elementId: r.newId });
        }}>
          <Copy className="h-4 w-4" />
        </SmallButton>
        <SmallButton label={t.bringForward} onClick={() => update(moveLayer(design, print.id, el.id, 1))}>
          <ArrowUp className="h-4 w-4" />
        </SmallButton>
        <SmallButton label={t.sendBackward} onClick={() => update(moveLayer(design, print.id, el.id, -1))}>
          <ArrowDown className="h-4 w-4" />
        </SmallButton>
        <SmallButton label={t.centerH} onClick={() => center("x")}>
          <AlignHorizontalJustifyCenter className="h-4 w-4" />
        </SmallButton>
        <SmallButton label={t.centerV} onClick={() => center("y")}>
          <AlignVerticalJustifyCenter className="h-4 w-4" />
        </SmallButton>
        <SmallButton label={el.locked ? t.unlock : t.lock} pressed={Boolean(el.locked)} onClick={() => set({ locked: !el.locked })}>
          {el.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </SmallButton>
        <SmallButton
          label={t.delete}
          danger
          onClick={() => {
            update(removeElement(design, print.id, el.id));
            select({ printId: print.id, elementId: null });
          }}
        >
          <Trash2 className="h-4 w-4" />
        </SmallButton>
      </div>

      {el.type === "text" ? (
        <>
          <Field label={t.text}>
            <input
              type="text"
              value={el.text}
              maxLength={60}
              dir="auto"
              onChange={(e) => {
                const text = e.target.value;
                const switchToArabic = hasArabic(text) && fontById(el.fontId).script === "latin";
                set({ text, ...(switchToArabic ? { fontId: "cairo" } : {}) }, "text");
              }}
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-cream focus:border-gold focus:outline-none"
            />
          </Field>
          <Field label={t.font}>
            <FontPicker value={el.fontId} arabic={hasArabic(el.text)} onChange={(fontId) => set({ fontId })} />
          </Field>
        </>
      ) : null}

      {el.type === "image" ? <ImageInfo el={el} onReplace={(patch) => set(patch)} /> : null}

      <Range
        label={t.size}
        valueLabel={fmt(t.sizeValue, { cm: (sizeValue / 10).toFixed(1) })}
        min={MIN_SIZE_MM}
        max={Math.round(maxSize)}
        step={0.5}
        value={Math.min(sizeValue, maxSize)}
        onChange={(v) => set(el.type === "text" ? { size: v } : { w: v }, "size")}
      />

      {el.type === "text" || el.type === "clipart" ? (
        <Field label={t.color}>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <Swatch key={c.id} size="sm" hex={c.hex} label={`${tr(c.name, locale)} · ${c.hex.toUpperCase()}`} selected={el.color.toLowerCase() === c.hex.toLowerCase()} onSelect={() => set({ color: c.hex })} />
            ))}
          </div>
        </Field>
      ) : null}

      {el.type === "text" ? (
        <>
          <Field label={t.outline}>
            <div className="flex gap-2">
              {([0, 1, 2] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={el.outline === o}
                  onClick={() => set({ outline: o })}
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs text-cream-muted aria-pressed:border-gold aria-pressed:bg-gold/10 aria-pressed:text-cream"
                >
                  {t.outlineOptions[o]}
                </button>
              ))}
            </div>
          </Field>
          {el.outline ? (
            <Field label={t.outlineColor}>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <Swatch key={c.id} size="sm" hex={c.hex} label={`${tr(c.name, locale)} · ${c.hex.toUpperCase()}`} selected={el.outlineColor.toLowerCase() === c.hex.toLowerCase()} onSelect={() => set({ outlineColor: c.hex })} />
                ))}
              </div>
            </Field>
          ) : null}
          {!hasArabic(el.text) ? (
            <Range label={t.letterSpacing} valueLabel={el.letterSpacing.toFixed(2)} min={-0.05} max={0.6} step={0.01} value={el.letterSpacing} onChange={(v) => set({ letterSpacing: v }, "spacing")} />
          ) : null}
          <Range
            label={t.curve}
            valueLabel={el.curve === 0 ? t.straight : String(el.curve)}
            min={-100}
            max={100}
            step={1}
            value={el.curve}
            onChange={(v) => set({ curve: Math.abs(v) < 3 ? 0 : v }, "curve")}
            onReset={el.curve !== 0 ? () => set({ curve: 0 }) : undefined}
            resetLabel={t.straight}
          />
        </>
      ) : null}

      <Range
        label={t.rotation}
        valueLabel={`${Math.round(el.rotation)}°`}
        min={-180}
        max={180}
        step={1}
        value={el.rotation}
        onChange={(v) => set({ rotation: v }, "rotation")}
        onReset={el.rotation !== 0 ? () => set({ rotation: 0 }) : undefined}
        resetLabel={t.reset}
      />
    </div>
  );
}

function ImageInfo({ el, onReplace }: { el: ImageElement; onReplace: (patch: Partial<ImageElement>) => void }) {
  const { dict } = useI18n();
  const t = dict.designer;
  const url = useAssetUrl(el.assetId);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dpi = imageDpi(el);
  const level = el.vector ? "great" : dpiLevel(dpi);
  const quality = el.vector
    ? t.vectorFile
    : fmt({ great: t.dpiGreat, ok: t.dpiOk, low: t.dpiLow, tooLow: t.dpiTooLow }[level], { dpi });
  const tone = level === "tooLow" ? "bg-arcane/70 text-cream" : level === "low" ? "bg-gold/15 text-gold-light" : "bg-emerald-900/40 text-emerald-200";

  const clearBackground = async () => {
    setFailed(false);
    setBusy(true);
    try {
      const blob = await getAsset(el.assetId);
      if (!blob) throw new Error("missing");
      const cleaned = await removeBackground(blob);
      const assetId = newElementId();
      await putAsset(assetId, cleaned);
      onReplace({ assetId, name: el.name.replace(/\.\w+$/, "") + ".png" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#2a1a1c_0%_25%,#1c0e10_0%_50%)] bg-[length:12px_12px]">
          {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-cream" dir="auto">{el.name}</p>
          <p className="text-xs text-cream-muted" dir="ltr">
            {Math.round(el.pxW)} × {Math.round(el.pxH)} px
          </p>
        </div>
      </div>
      <p className={`rounded-lg px-3 py-2 text-xs ${tone}`}>
        <span className="font-semibold">{t.printQuality}: </span>
        {quality}
      </p>
      {!el.vector ? (
        <div>
          <button
            type="button"
            onClick={() => void clearBackground()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 px-3 py-2 text-xs font-semibold text-cream hover:border-gold hover:bg-gold/10 disabled:opacity-60"
          >
            <Eraser className="h-4 w-4" aria-hidden />
            {busy ? t.removingBackground : t.removeBackground}
          </button>
          <p className="mt-1 text-xs text-cream-muted">{failed ? t.removeBackgroundFailed : t.removeBackgroundHint}</p>
        </div>
      ) : null}
    </div>
  );
}

function FontPicker({ value, arabic, onChange }: { value: string; arabic: boolean; onChange: (id: string) => void }) {
  const { dict } = useI18n();
  const t = dict.designer;
  const groups = arabic
    ? [{ label: t.arabicFonts, fonts: designFonts.filter((f) => f.script === "arabic") }]
    : [
        { label: t.latinFonts, fonts: designFonts.filter((f) => f.script === "latin") },
        { label: t.arabicFonts, fonts: designFonts.filter((f) => f.script === "arabic") },
      ];
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 text-[11px] tracking-wider text-cream-muted uppercase">{g.label}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {g.fonts.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={value === f.id}
                onClick={() => onChange(f.id)}
                className="truncate rounded-lg border border-line px-2 py-2 text-base text-cream-muted aria-pressed:border-gold aria-pressed:bg-gold/10 aria-pressed:text-cream"
                style={{ fontFamily: f.family, fontWeight: f.weight }}
              >
                {f.script === "arabic" ? "دفعة 27" : f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-cream-muted">{label}</p>
      {children}
    </div>
  );
}

function Range({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  onReset,
  resetLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-cream-muted">{label}</span>
        <span className="flex items-center gap-2 text-cream">
          {valueLabel}
          {onReset ? (
            <button type="button" onClick={onReset} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-cream-muted hover:border-gold hover:text-gold">
              {resetLabel}
            </button>
          ) : null}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#C9A227]"
      />
    </div>
  );
}

function SmallButton({ label, onClick, children, pressed, danger }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
        danger ? "border-arcane-bright/60 text-cream hover:bg-arcane" : "border-line text-cream-muted hover:border-gold hover:text-gold aria-pressed:border-gold aria-pressed:text-gold"
      }`}
    >
      {children}
    </button>
  );
}
