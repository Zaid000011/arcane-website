"use client";

import { CheckCircle2, FileText, MessageCircle, Palette, Ruler, Send, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { ApiError, api, whatsappTo } from "@/lib/api-client";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { closestColor, normalizeHex } from "@/lib/color-match";
import { normalizePhone } from "@/lib/group/rules";
import { STATIC_SITE } from "@/lib/site-mode";
import type { CustomRequestInput } from "@/lib/validation";
import { requestMessage } from "@/lib/whatsapp-order";
import {
  looksLikeRequestFile,
  MAX_REQUEST_FILE_BYTES,
  MAX_REQUEST_FILE_MB,
  MAX_REQUEST_FILES,
  REQUEST_FILE_ACCEPT,
  REQUEST_PHOTO_ACCEPT,
  REQUEST_KINDS,
  requestRef,
  type RequestKind,
} from "@/lib/requests/types";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { canEmail, MAX_EMAIL_BYTES } from "@/lib/email-inbox";

const CONTACT_KEY = "arcane-contact";
const MAX_PHOTOS = 3;

type Measure = "chest" | "length" | "sleeve" | "height" | "weight" | "count";
const RANGES: Record<Measure, [number, number]> = { chest: [20, 120], length: [30, 150], sleeve: [5, 120], height: [50, 250], weight: [20, 300], count: [1, 1000] };
const OPTIONAL: Measure[] = ["sleeve", "height", "weight"];

const fieldClass = (bad: boolean) =>
  `w-full rounded-lg border bg-ink px-3 py-2.5 text-sm text-cream placeholder:text-cream-muted/50 focus:outline-none ${bad ? "border-arcane-bright focus:border-arcane-bright" : "border-line focus:border-gold"}`;

/** Western digits, so "٦٥" and "65,5" both work. */
const toNumber = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", "."));

interface Props {
  catalog: Catalog;
  kind: RequestKind;
  /** Shows the "my design / a color / a size" switch (on the /send page). */
  onKindChange?: (kind: RequestKind) => void;
  /** The garment the customer is looking at, if any. */
  productId?: string;
  /** Inside the designer: closes the window ("Keep designing"). */
  onDone?: () => void;
  onSent?: () => void;
  /** Inside the designer: switch the garment to the closest color we have. */
  onUseColor?: (colorId: string) => void;
}

/** "Send it to us": the customer's own design, a color they couldn't find, or a size that isn't on the list. */
export function SendRequestForm({ catalog, kind, onKindChange, productId: initialProduct = "", onDone, onSent, onUseColor }: Props) {
  const { locale, dict } = useI18n();
  const t = dict.send;
  const products = catalog.products.filter((p) => p.enabled);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState(products.some((p) => p.id === initialProduct) ? initialProduct : "");
  const [quantity, setQuantity] = useState("");
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [hex, setHex] = useState("");
  const [colorName, setColorName] = useState("");
  const [measures, setMeasures] = useState<Record<Measure, string>>({ chest: "", length: "", sleeve: "", height: "", weight: "", count: "1" });
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // On GitHub Pages there's no server: the request is emailed (files included) and WhatsApp is for chatting.
  const [waLink, setWaLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  // Files can go by email on GitHub Pages; without an inbox they're added in WhatsApp instead.
  const filesHere = !STATIC_SITE || canEmail();

  // Remember the name and number from last time on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "null") as { name?: string; phone?: string } | null;
      if (saved?.name) setName((v) => v || saved.name!);
      if (saved?.phone) setPhone((v) => v || saved.phone!);
    } catch {
      // Storage can be blocked; the fields just start empty.
    }
  }, []);

  const files = kind === "design" ? designFiles : kind === "color" ? photos : [];
  const setFiles = kind === "design" ? setDesignFiles : setPhotos;
  const maxFiles = kind === "design" ? MAX_REQUEST_FILES : MAX_PHOTOS;
  const color = normalizeHex(hex);
  // Only suggest a color we have when it's genuinely close (a perceptual distance under ~18).
  const closest = useMemo(() => {
    const match = color ? closestColor(color, catalog.colors) : null;
    return match && match.distance < 18 ? match : null;
  }, [color, catalog.colors]);

  const measureBad = (k: Measure) => {
    const v = measures[k].trim();
    if (!v) return !OPTIONAL.includes(k);
    const n = toNumber(v);
    const [min, max] = RANGES[k];
    return !Number.isFinite(n) || n < min || n > max || (k === "count" && !Number.isInteger(n));
  };
  const problems = {
    name: name.trim().length < 2,
    phone: !normalizePhone(phone),
    files: filesHere && kind === "design" && designFiles.length === 0,
    color: kind === "color" && !color,
    quantity: quantity.trim() !== "" && !(Number.isInteger(toNumber(quantity)) && toNumber(quantity) >= 1 && toNumber(quantity) <= 100_000),
    measures: kind === "size" && (Object.keys(RANGES) as Measure[]).some(measureBad),
  };
  const show = (k: keyof typeof problems) => touched && problems[k];

  const [fileNote, setFileNote] = useState<string | null>(null);
  const addFiles = (list: FileList | File[]) => {
    const next = [...files];
    const notes: string[] = [];
    for (const f of Array.from(list)) {
      if (next.length >= maxFiles) {
        notes.push(fmt(t.tooManyFiles, { max: maxFiles }));
        break;
      }
      if (!looksLikeRequestFile(f.name, kind === "color")) notes.push(fmt(t.fileBadType, { name: f.name }));
      else if (f.size > MAX_REQUEST_FILE_BYTES) notes.push(fmt(t.fileTooBig, { name: f.name, mb: MAX_REQUEST_FILE_MB }));
      else if (STATIC_SITE && next.reduce((sum, x) => sum + x.size, 0) + f.size > MAX_EMAIL_BYTES) {
        notes.push(t.emailFilesTooBig);
        break;
      } else if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    setFileNote(notes.length ? notes.join(" ") : null);
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (Object.values(problems).some(Boolean)) {
      setError(t.errors.invalid);
      return;
    }
    const num = (k: Measure) => (measures[k].trim() ? toNumber(measures[k]) : undefined);
    const data = {
      kind,
      locale,
      name: name.trim(),
      phone,
      productId,
      quantity: quantity.trim() ? toNumber(quantity) : undefined,
      color: kind === "color" ? { hex: color, name: colorName.trim() } : undefined,
      size: kind === "size" ? { chest: num("chest"), length: num("length"), sleeve: num("sleeve"), height: num("height"), weight: num("weight"), count: num("count") } : undefined,
      message: message.trim(),
    };
    if (STATIC_SITE) {
      const link = whatsappTo(siteConfig.whatsappNumber, requestMessage(catalog, data as unknown as CustomRequestInput, locale, dict));
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone }));
      } catch {
        // Not saved on this device; nothing else depends on it.
      }
      if (canEmail()) {
        setBusy(true);
        try {
          const { emailRequest } = await import("@/lib/email-order");
          await emailRequest(catalog, data as unknown as Omit<CustomRequestInput, "locale">, files, locale);
          setEmailed(true);
          setWaLink(link);
          onSent?.();
        } catch {
          // Couldn't email it: WhatsApp still works.
          setError(t.sendFailedWhatsapp);
          setWaLink(link);
        } finally {
          setBusy(false);
        }
        return;
      }
      setWaLink(link);
      window.open(link, "_blank", "noopener,noreferrer");
      onSent?.();
      return;
    }
    const form = new FormData();
    form.append("data", JSON.stringify(data));
    for (const f of files) form.append("files", f, f.name);
    setBusy(true);
    try {
      const res = await api<{ code: string }>("/api/requests", { method: "POST", form });
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone }));
      } catch {
        // Not saved on this device; nothing else depends on it.
      }
      setSent(res.code);
      onSent?.();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError((t.errors as Record<string, string>)[code] ?? t.errors.server);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSent(null);
    setWaLink(null);
    setEmailed(false);
    setTouched(false);
    setDesignFiles([]);
    setPhotos([]);
    setHex("");
    setColorName("");
    setMeasures({ chest: "", length: "", sleeve: "", height: "", weight: "", count: "1" });
    setMessage("");
    setQuantity("");
  };

  if (sent) {
    const ref = requestRef(sent);
    return (
      <div role="status" className="scroll-mt-24 py-6 text-center" ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
        <CheckCircle2 className="mx-auto h-14 w-14 text-gold" aria-hidden />
        <h3 className="mt-3 font-display text-3xl tracking-wide uppercase">{t.sentTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-cream-muted">{fmt(t.sentBody, { code: ref })}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onDone ? (
            <button type="button" onClick={onDone} className="btn btn-primary">
              {t.keepDesigning}
            </button>
          ) : null}
          {siteConfig.whatsappNumber ? (
            <a href={whatsappTo(siteConfig.whatsappNumber, fmt(t.whatsappMessage, { code: ref }))} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <MessageCircle className="h-4 w-4" aria-hidden /> {t.whatsappNow}
            </a>
          ) : null}
          <button type="button" onClick={reset} className="btn btn-secondary">
            {t.sendAnother}
          </button>
        </div>
      </div>
    );
  }

  if (waLink) {
    return (
      <div role="status" className="scroll-mt-24 py-6 text-center" ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
        {emailed ? <CheckCircle2 className="mx-auto h-14 w-14 text-gold" aria-hidden /> : <MessageCircle className="mx-auto h-14 w-14 text-gold" aria-hidden />}
        <h3 className="mt-3 font-display text-3xl tracking-wide uppercase">{emailed ? t.emailSentTitle : t.whatsappOpenedTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-cream-muted">{emailed ? t.emailSentBody : error ?? t.whatsappOpenedBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={waLink} target="_blank" rel="noopener noreferrer" className={emailed ? "btn btn-secondary" : "btn btn-primary"}>
            <MessageCircle className="h-4 w-4" aria-hidden /> {emailed ? t.chatWhatsapp : t.whatsappSubmit}
          </a>
          {onDone ? (
            <button type="button" onClick={onDone} className="btn btn-secondary">
              {t.keepDesigning}
            </button>
          ) : null}
          <button type="button" onClick={reset} className="btn btn-secondary">
            {t.sendAnother}
          </button>
        </div>
      </div>
    );
  }

  const kindIcon = { design: Upload, color: Palette, size: Ruler } as const;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-5"
    >
      {onKindChange ? (
        <div role="group" aria-label={t.pageTitle} className="grid grid-cols-3 gap-1 rounded-full border border-line bg-ink p-1">
          {REQUEST_KINDS.map((k) => {
            const Icon = kindIcon[k];
            return (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => onKindChange(k)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-semibold text-cream-muted transition-colors hover:text-cream aria-pressed:bg-gold aria-pressed:text-ink sm:text-sm"
              >
                <Icon className="hidden h-4 w-4 sm:block" aria-hidden /> {t.tabs[k]}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="text-sm leading-relaxed text-cream-muted">{t.intros[kind]}</p>

      {kind === "design" && !filesHere ? <WhatsappNote>{t.filesInWhatsapp}</WhatsappNote> : null}
      {kind === "design" && filesHere ? (
        <FilePicker
          label={t.files}
          hint={fmt(t.filesHint, { max: MAX_REQUEST_FILES, mb: MAX_REQUEST_FILE_MB })}
          accept={REQUEST_FILE_ACCEPT}
          files={designFiles}
          max={maxFiles}
          onAdd={addFiles}
          onRemove={(i) => setDesignFiles(designFiles.filter((_, j) => j !== i))}
          error={show("files") ? t.filesRequired : fileNote}
        />
      ) : null}

      {kind === "color" ? (
        <>
          <Field label={t.colorCode} hint={t.colorCodeHint} error={show("color") ? t.colorCodeInvalid : null}>
            <div className="flex items-center gap-3">
              <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/40 ring-1 ring-line" style={{ backgroundColor: color ?? "#1c2541" }}>
                <span className="sr-only">{t.pickColor}</span>
                <input type="color" value={(color ?? "#1C2541").toLowerCase()} onChange={(e) => setHex(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
              <input
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                onBlur={() => color && setHex(color)}
                placeholder="#1C2541"
                maxLength={7}
                dir="ltr"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${fieldClass(Boolean(show("color")))} font-mono uppercase`}
              />
            </div>
          </Field>
          {closest ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm">
              <span className="h-7 w-7 shrink-0 rounded-full border border-black/40" style={{ backgroundColor: closest.color.hex }} aria-hidden />
              <span className="min-w-0 flex-1 text-cream-muted">{fmt(t.closest, { name: tr(closest.color.name, locale), hex: closest.color.hex.toUpperCase() })}</span>
              {onUseColor ? (
                <button type="button" onClick={() => onUseColor(closest.color.id)} className="rounded-full border border-gold/50 px-3 py-1 text-xs font-semibold text-gold hover:bg-gold/10">
                  {t.useClosest}
                </button>
              ) : null}
            </div>
          ) : null}
          <Field label={t.colorName}>
            <input value={colorName} onChange={(e) => setColorName(e.target.value)} maxLength={80} dir="auto" placeholder={t.colorNamePlaceholder} className={fieldClass(false)} />
          </Field>
          {filesHere ? null : <WhatsappNote>{t.photoInWhatsapp}</WhatsappNote>}
          {!filesHere ? null : (
            <FilePicker
            label={t.photos}
            hint={t.photosHint}
            accept={REQUEST_PHOTO_ACCEPT}
            files={photos}
            max={maxFiles}
            onAdd={addFiles}
            onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))}
            error={fileNote}
          />
          )}
        </>
      ) : null}

      {kind === "size" ? (
        <fieldset className="space-y-4">
          <legend className="mb-2 font-serif text-sm font-bold tracking-wider text-gold uppercase">{t.measurements}</legend>
          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
            <figure className="rounded-xl border border-line bg-ink/60 p-3">
              <MeasureDiagram />
              <figcaption className="mt-1 text-center text-xs text-cream-muted">{t.howToMeasure}</figcaption>
            </figure>
            <div className="grid grid-cols-2 gap-3">
              <MeasureInput letter="A" label={t.chest} hint={t.chestHint} value={measures.chest} bad={touched && measureBad("chest")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, chest: v })} />
              <MeasureInput letter="B" label={t.length} hint={t.lengthHint} value={measures.length} bad={touched && measureBad("length")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, length: v })} />
              <MeasureInput letter="C" label={t.sleeveLength} hint={t.sleeveHint} value={measures.sleeve} bad={touched && measureBad("sleeve")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, sleeve: v })} />
              <MeasureInput label={t.sizeCount} value={measures.count} bad={touched && measureBad("count")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, count: v })} integer />
              <MeasureInput label={t.height} value={measures.height} bad={touched && measureBad("height")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, height: v })} />
              <MeasureInput label={t.weight} value={measures.weight} bad={touched && measureBad("weight")} error={t.measurementsInvalid} onChange={(v) => setMeasures({ ...measures, weight: v })} />
            </div>
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.garment}>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={fieldClass(false)}>
            <option value="">{t.garmentAny}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {tr(p.name, locale)}
              </option>
            ))}
          </select>
        </Field>
        {kind !== "size" ? (
          <Field label={t.quantity} error={show("quantity") ? t.measurementsInvalid : null}>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" dir="ltr" placeholder={t.quantityPlaceholder} className={fieldClass(Boolean(show("quantity")))} />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} error={show("name") ? t.required : null}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} dir="auto" autoComplete="name" className={fieldClass(Boolean(show("name")))} />
        </Field>
        <Field label={t.phone} hint={t.phoneHint} error={show("phone") ? t.phoneInvalid : null}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" placeholder={t.phonePlaceholder} className={fieldClass(Boolean(show("phone")))} />
        </Field>
      </div>

      <Field label={t.message}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} dir="auto" placeholder={t.messagePlaceholder[kind]} className={fieldClass(false)} />
      </Field>

      {error ? (
        <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5 text-base disabled:opacity-60">
        {STATIC_SITE ? canEmail() ? <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden /> : null}
        {busy ? t.sending : STATIC_SITE ? (canEmail() ? t.emailSubmit : t.whatsappSubmit) : t.submit}
      </button>
    </form>
  );
}

function WhatsappNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-gold/40 bg-ink/50 px-3 py-3 text-sm text-cream-muted">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
      {children}
    </p>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-arcane-bright">{error}</span> : hint ? <span className="mt-1 block text-xs text-cream-muted/80">{hint}</span> : null}
    </label>
  );
}

function MeasureInput({
  letter,
  label,
  hint,
  value,
  bad,
  error,
  integer,
  onChange,
}: {
  letter?: string;
  label: string;
  hint?: string;
  value: string;
  bad: boolean;
  error: string;
  integer?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-cream-muted">
        {letter ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-ink">{letter}</span> : null}
        {label}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={integer ? "numeric" : "decimal"} dir="ltr" className={fieldClass(bad)} />
      {bad ? <span className="mt-1 block text-xs text-arcane-bright">{error}</span> : hint ? <span className="mt-1 block text-[11px] leading-snug text-cream-muted/80">{hint}</span> : null}
    </label>
  );
}

function FilePicker({
  label,
  hint,
  accept,
  files,
  max,
  error,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  accept: string;
  files: File[];
  max: number;
  error: string | null;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (index: number) => void;
}) {
  const { dict } = useI18n();
  const t = dict.send;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const previews = useMemo(() => files.map((f) => (/^image\/(png|jpeg|webp)$/.test(f.type) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{label}</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed p-3 transition-colors ${over ? "border-gold bg-gold/10" : error ? "border-arcane-bright" : "border-gold/40"}`}
      >
        {files.length ? (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="relative overflow-hidden rounded-lg border border-line bg-ink" title={f.name}>
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
                  <img src={previews[i]!} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square flex-col items-center justify-center gap-1 text-cream-muted">
                    <FileText className="h-7 w-7" aria-hidden />
                    <span className="text-[10px] uppercase">{f.name.split(".").pop()}</span>
                  </span>
                )}
                <span className="block truncate px-1.5 py-1 text-[10px] text-cream-muted" dir="auto">
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={fmt(t.removeFile, { name: f.name })}
                  className="absolute end-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/85 text-cream hover:bg-arcane"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length < max ? (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-4 text-sm font-semibold text-gold hover:bg-gold/10">
            <Upload className="h-6 w-6" aria-hidden />
            {files.length ? t.addMore : t.addFiles}
          </button>
        ) : null}
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          onChange={(e) => {
            if (e.target.files?.length) onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-arcane-bright">{error}</p> : <p className="mt-1 text-xs text-cream-muted/80">{hint}</p>}
    </div>
  );
}

/** A flat tee with the three measurements marked A, B and C. */
function MeasureDiagram() {
  return (
    <svg viewBox="0 0 200 170" className="h-auto w-full" role="img" aria-hidden>
      <defs>
        <marker id="m-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#e2c766" />
        </marker>
      </defs>
      <path
        d="M72 18 Q100 36 128 18 L166 30 L196 70 L172 90 L154 76 L154 162 L46 162 L46 76 L28 90 L4 70 L34 30 Z"
        fill="#4a1218"
        stroke="#c9b79c"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M72 18 Q100 36 128 18" fill="none" stroke="#c9b79c" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
      <line x1="50" y1="84" x2="150" y2="84" stroke="#e2c766" strokeWidth="2" markerStart="url(#m-arrow)" markerEnd="url(#m-arrow)" />
      <line x1="138" y1="26" x2="138" y2="158" stroke="#e2c766" strokeWidth="2" markerStart="url(#m-arrow)" markerEnd="url(#m-arrow)" />
      <line x1="169" y1="36" x2="187" y2="62" stroke="#e2c766" strokeWidth="2" markerStart="url(#m-arrow)" markerEnd="url(#m-arrow)" />
      {[
        { x: 96, y: 78, l: "A" },
        { x: 126, y: 124, l: "B" },
        { x: 190, y: 44, l: "C" },
      ].map((p) => (
        <g key={p.l}>
          <circle cx={p.x} cy={p.y} r="8" fill="#c9a227" />
          <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#140a0b" fontFamily="system-ui, sans-serif">
            {p.l}
          </text>
        </g>
      ))}
    </svg>
  );
}
