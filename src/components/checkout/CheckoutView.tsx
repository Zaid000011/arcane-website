"use client";

import { AlertTriangle, ArrowLeft, Lock, School, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { GarmentImage } from "@/components/three/GarmentImage";
import { siteConfig } from "@/config/site";
import { ApiError, api, uploadDesignAssets } from "@/lib/api-client";
import { ensureCartLoaded, useCartReady, useCartStore } from "@/lib/cart/store";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { allowedMethods, paymentPlan, priceItem, shippingSelection } from "@/lib/checkout/plan";
import type { DeliveryMethod, PaymentMethod } from "@/lib/checkout/types";
import { normalizePhone } from "@/lib/group/rules";
import { newOrderSecrets, rememberOrder } from "@/lib/order/my-orders";
import { shippingFor } from "@/lib/pricing/engine";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CheckoutView({ catalog }: { catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.checkout;
  const router = useRouter();
  const ready = useCartReady();
  const items = useCartStore((s) => s.items);
  const priced = useMemo(() => items.map((item) => ({ item, ...priceItem(catalog, item.design, item.order) })), [catalog, items]);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    method: "delivery" as DeliveryMethod,
    governorateId: "",
    city: "",
    address: "",
    school: "",
    notes: "",
  });
  const [choice, setChoice] = useState<PaymentMethod>("transfer");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "uploading" | "placing" | "done">(null);
  const [error, setError] = useState<string | null>(null);
  // Kept for retries, so sending again can never create a second order.
  const secrets = useRef<{ requestId: string; key: string } | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const money = (n: number) => formatMoney(n, locale);

  const itemsTotal = priced.reduce((sum, p) => sum + p.quote.total, 0);
  const shippingFee = shippingFor(catalog, shippingSelection(form)).fee;
  const total = itemsTotal + (shippingFee ?? 0);
  const methods = allowedMethods(catalog.payments, total);
  const method = methods.includes(choice) ? choice : (methods[0] ?? "transfer");
  const plan = paymentPlan(catalog.payments, total, method);
  const workingDays = Math.max(0, ...priced.map((p) => p.quote.delivery.workingDays));
  const blocking = priced.some((p) => p.blocking);
  const pickup = form.method === "pickup";

  const problems = {
    name: form.name.trim().length < 2,
    phone: !normalizePhone(form.phone),
    email: form.email.trim() !== "" && !EMAIL_RE.test(form.email.trim()),
    governorateId: !pickup && !form.governorateId,
    city: form.method === "delivery" && form.city.trim().length < 2,
    address: form.method === "delivery" && form.address.trim().length < 5,
    school: form.method === "school" && form.school.trim().length < 2,
  };
  const invalid = Object.values(problems).some(Boolean);
  const show = (k: keyof typeof problems) => touched && problems[k];

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (busy || invalid || blocking || !plan) return;
    secrets.current ??= newOrderSecrets();
    const { requestId, key } = secrets.current;
    try {
      setBusy("uploading");
      for (const p of priced) await uploadDesignAssets(p.design);
      setBusy("placing");
      const res = await api<{ code: string }>("/api/orders", {
        method: "POST",
        body: {
          requestId,
          key,
          locale,
          customer: { name: form.name.trim(), phone: form.phone, email: form.email.trim() },
          shipping: { method: form.method, governorateId: pickup ? "" : form.governorateId, city: form.city.trim(), address: form.address.trim(), school: form.school.trim() },
          paymentMethod: method,
          notes: form.notes.trim(),
          items: priced.map((p) => ({ design: p.design, order: p.item.order, ...(p.item.groupCode ? { groupCode: p.item.groupCode } : {}) })),
        },
      });
      setBusy("done");
      rememberOrder({ code: res.code, key, createdAt: new Date().toISOString(), total });
      await ensureCartLoaded();
      useCartStore.getState().clear();
      router.push(`/track/${res.code}#key=${key}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError(t.errors[code as keyof typeof t.errors] ?? t.errors.server);
      setBusy(null);
    }
  };

  if (!ready) return <div className="section min-h-[50vh] py-14" aria-busy="true" />;
  if (busy === "done") {
    return (
      <div className="section flex min-h-[50vh] items-center justify-center py-14 text-cream-muted" role="status">
        {t.opening}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="section flex min-h-[50vh] flex-col items-center justify-center py-14 text-center">
        <h1 className="font-display text-4xl tracking-wide uppercase">{t.title}</h1>
        <p className="mt-2 text-cream-muted">{t.empty}</p>
        <Link href="/design" className="btn btn-primary mt-6">
          {dict.cart.emptyCta}
        </Link>
      </div>
    );
  }

  const fieldClass = (bad: boolean) =>
    `w-full rounded-lg border bg-ink px-3 py-2.5 text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none ${bad ? "border-arcane-bright" : "border-line"}`;

  const deliveryOptions: { id: DeliveryMethod; icon: typeof Truck; label: string; hint: string }[] = [
    { id: "delivery", icon: Truck, label: t.methodDelivery, hint: t.methodDeliveryHint },
    { id: "school", icon: School, label: t.methodSchool, hint: t.methodSchoolHint },
    ...(catalog.pickup.enabled ? [{ id: "pickup" as const, icon: Store, label: t.methodPickup, hint: t.methodPickupHint }] : []),
  ];
  const pickupPlace = tr(siteConfig.pickupLocation, locale);
  const restLabel = pickup ? t.payAtPickup : t.payOnDelivery;

  return (
    <div className="section py-10">
      <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t.backToCart}
      </Link>
      <h1 className="mt-3 font-display text-4xl tracking-wide uppercase sm:text-5xl">{t.title}</h1>

      {blocking ? (
        <p role="alert" className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-arcane/60 px-4 py-3 text-sm text-cream">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {t.fixCart}
          <Link href="/cart" className="font-semibold text-gold underline-offset-4 hover:underline">
            {t.goToCart}
          </Link>
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Section step={1} title={t.contactTitle}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.name} error={show("name") ? t.required : null}>
                <input value={form.name} maxLength={60} dir="auto" autoComplete="name" onChange={(e) => set("name", e.target.value)} className={fieldClass(show("name"))} />
              </Field>
              <Field label={t.phone} hint={t.phoneHint} error={show("phone") ? t.phoneInvalid : null}>
                <input value={form.phone} inputMode="tel" autoComplete="tel" dir="ltr" placeholder={t.phonePlaceholder} onChange={(e) => set("phone", e.target.value)} className={fieldClass(show("phone"))} />
              </Field>
            </div>
            <Field label={t.email} hint={t.emailHint} error={show("email") ? t.emailInvalid : null}>
              <input value={form.email} type="email" autoComplete="email" dir="ltr" onChange={(e) => set("email", e.target.value)} className={fieldClass(show("email"))} />
            </Field>
          </Section>

          <Section step={2} title={t.deliveryTitle}>
            <fieldset>
              <legend className="sr-only">{t.deliveryTitle}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {deliveryOptions.map((o) => (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-light ${form.method === o.id ? "border-gold bg-gold/10" : "border-line hover:border-gold/50"}`}
                  >
                    <input type="radio" name="delivery-method" value={o.id} checked={form.method === o.id} onChange={() => set("method", o.id)} className="sr-only" />
                    <o.icon className="h-5 w-5 text-gold" aria-hidden />
                    <span className="font-semibold text-cream">{o.label}</span>
                    <span className="text-xs text-cream-muted">{o.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {pickup ? (
              <p className="rounded-lg bg-ink px-3 py-2.5 text-sm text-cream-muted">{pickupPlace ? fmt(t.pickupAt, { place: pickupPlace }) : t.pickupLater}</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.governorate} error={show("governorateId") ? t.required : null}>
                    <select value={form.governorateId} onChange={(e) => set("governorateId", e.target.value)} className={fieldClass(show("governorateId"))}>
                      <option value="">{t.chooseGovernorate}</option>
                      {catalog.governorates.map((g) => (
                        <option key={g.id} value={g.id}>
                          {tr(g.name, locale)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {form.method === "delivery" ? (
                    <Field label={t.city} error={show("city") ? t.required : null}>
                      <input value={form.city} maxLength={60} dir="auto" autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} className={fieldClass(show("city"))} />
                    </Field>
                  ) : (
                    <Field label={t.school} error={show("school") ? t.required : null}>
                      <input value={form.school} maxLength={100} dir="auto" placeholder={t.schoolPlaceholder} onChange={(e) => set("school", e.target.value)} className={fieldClass(show("school"))} />
                    </Field>
                  )}
                </div>
                <Field label={form.method === "delivery" ? t.address : t.schoolAddress} error={show("address") ? t.required : null}>
                  <textarea
                    value={form.address}
                    rows={2}
                    maxLength={300}
                    dir="auto"
                    autoComplete={form.method === "delivery" ? "street-address" : "off"}
                    placeholder={form.method === "delivery" ? t.addressPlaceholder : t.schoolAddressPlaceholder}
                    onChange={(e) => set("address", e.target.value)}
                    className={fieldClass(show("address"))}
                  />
                </Field>
                {shippingFee !== null ? <p className="text-sm text-cream-muted">{fmt(t.shippingFee, { amount: money(shippingFee) })}</p> : null}
              </>
            )}
          </Section>

          <Section step={3} title={t.paymentTitle}>
            <fieldset className="space-y-3">
              <legend className="sr-only">{t.paymentTitle}</legend>
              {methods.map((m) => {
                const p = paymentPlan(catalog.payments, total, m)!;
                const full = m === "transfer" && p.onDelivery === 0;
                const label = m === "cod" ? t.payCod : full ? t.payFull : fmt(t.payDeposit, { percent: catalog.payments.depositPercent });
                const hint =
                  m === "cod"
                    ? fmt(pickup ? t.payCodPickupHint : t.payCodHint, { amount: money(p.onDelivery) })
                    : full
                      ? fmt(t.payFullHint, { amount: money(p.upfront) })
                      : fmt(pickup ? t.payDepositPickupHint : t.payDepositHint, { amount: money(p.upfront), rest: money(p.onDelivery) });
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-light ${method === m ? "border-gold bg-gold/10" : "border-line hover:border-gold/50"}`}
                  >
                    <input type="radio" name="payment-method" value={m} checked={method === m} onChange={() => setChoice(m)} className="mt-1 h-4 w-4 shrink-0 accent-[#C9A227]" />
                    <span>
                      <span className="block font-semibold text-cream">{label}</span>
                      <span className="mt-1 block text-sm text-cream-muted">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <Field label={t.notes}>
              <textarea value={form.notes} rows={3} maxLength={1000} dir="auto" placeholder={t.notesPlaceholder} onChange={(e) => set("notes", e.target.value)} className={fieldClass(false)} />
            </Field>
          </Section>
        </div>

        <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-20" aria-labelledby="checkout-summary">
          <h2 id="checkout-summary" className="font-serif text-lg font-bold text-gold">
            {t.summaryTitle}
          </h2>
          <ul className="space-y-3">
            {priced.map(({ item, design, quote }) => {
              const product = catalog.products.find((p) => p.id === design.productId);
              const sample = item.order.roster.find((r) => r.name || r.number);
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <GarmentImage
                    catalog={catalog}
                    design={design}
                    width={160}
                    height={180}
                    samples={{ name: sample?.name || dict.designer.sampleName, number: sample?.number || dict.designer.sampleNumber }}
                    alt={product ? tr(product.name, locale) : design.productId}
                    className="h-[4.5rem] w-16 shrink-0 rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.14),transparent_65%)] object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-cream">{product ? tr(product.name, locale) : design.productId}</p>
                    <p className="text-xs text-cream-muted">{fmt(t.pieces, { count: quote.quantity })}</p>
                  </div>
                  <p className="text-sm text-cream">{money(quote.total)}</p>
                </li>
              );
            })}
          </ul>

          <dl className="space-y-2 border-t border-line pt-3 text-sm">
            <Row label={t.items} value={money(itemsTotal)} />
            <Row label={t.shipping} value={shippingFee === null ? t.chooseDelivery : shippingFee === 0 ? t.free : money(shippingFee)} muted={shippingFee === null} />
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
              <dt className="font-semibold text-cream">{t.total}</dt>
              <dd className="font-display text-2xl tracking-wide text-gold">{money(total)}</dd>
            </div>
            {plan && plan.upfront > 0 ? <Row label={t.payNow} value={money(plan.upfront)} strong /> : null}
            {plan && plan.onDelivery > 0 ? <Row label={restLabel} value={money(plan.onDelivery)} /> : null}
          </dl>

          {workingDays > 0 ? <p className="text-xs text-cream-muted">{fmt(t.readyIn, { days: workingDays })}</p> : null}

          {touched && invalid ? (
            <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
              {t.checkFields}
            </p>
          ) : error ? (
            <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
              {error}
            </p>
          ) : null}
          <button type="button" onClick={() => void submit()} disabled={Boolean(busy) || blocking} className="btn btn-primary w-full py-3.5 text-base disabled:opacity-60">
            {busy === "uploading" ? t.uploading : busy === "placing" ? t.placing : t.placeOrder}
          </button>
          <p className="flex items-center gap-2 text-xs text-cream-muted">
            <Lock className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden /> {t.privacy}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6" aria-labelledby={`checkout-step-${step}`}>
      <h2 id={`checkout-step-${step}`} className="flex items-center gap-3 font-serif text-lg font-bold text-cream">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-arcane text-sm text-gold" aria-hidden>
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
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

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold text-cream" : "text-cream-muted"}>{label}</dt>
      <dd className={muted ? "text-cream-muted" : strong ? "font-semibold text-gold-light" : "text-cream"}>{value}</dd>
    </div>
  );
}
