import type { CartItem } from "@/lib/cart/store";
import { normalizePhone } from "@/lib/group/rules";
import { tr } from "@/lib/catalog";
import type { Catalog, Locale } from "@/lib/catalog/types";
import { priceItem } from "@/lib/checkout/plan";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { effectiveSizes } from "@/lib/order/roster";
import type { CustomRequestInput } from "@/lib/validation";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { en } from "@/i18n/dictionaries/en";
import { fmt, formatMoney } from "@/i18n/format";

/**
 * Messages for the GitHub Pages copy of the site, which has no server: the
 * cart and the "send it to us" forms email the order (with pictures of the
 * design) and open WhatsApp with everything filled in.
 */

const MAX_PEOPLE = 60;

/** The whole cart as one WhatsApp message: each piece, its sizes and price, and the total. */
export function orderMessage(catalog: Catalog, items: CartItem[], locale: Locale, dict: Dictionary, phone: string): string {
  const t = dict.cart;
  const d = dict.designer;
  const lines: string[] = [t.waIntro, fmt(t.waPhoneLine, { phone: normalizePhone(phone) ?? phone }), ""];
  let total = 0;
  let images = false;
  items.forEach((item, index) => {
    const { design, quote } = priceItem(catalog, item.design, item.order);
    const info = describeDesign(catalog, design, locale, d);
    const sizes = effectiveSizes(item.order, design.personalization);
    const speed = catalog.deliverySpeeds.find((s) => s.id === item.order.deliverySpeedId);
    total += quote.total;
    images ||= design.prints.some((p) => (p.elements ?? []).some((e) => e.type === "image"));
    lines.push(`*${index + 1}. ${info.garment}*`);
    lines.push(`${d.summaryColors}: ${info.colors.join(", ")}`);
    lines.push(`${d.summaryPrints}: ${info.prints.length ? info.prints.join(" / ") : d.noPrints}`);
    if (info.personalization.length) lines.push(`${d.summaryPersonalization}: ${info.personalization.join(", ")}`);
    lines.push(`${d.summaryQuantity}: ${fmt(d.piecesTotal, { count: quote.quantity })} (${describeSizes(catalog, sizes)})`);
    const people = item.order.roster.filter((r) => r.name || r.number);
    for (const r of people.slice(0, MAX_PEOPLE)) {
      const size = catalog.sizes.find((s) => s.id === r.sizeId)?.label ?? r.sizeId;
      lines.push(`  - ${[r.name, r.number, size].filter(Boolean).join(" · ")}`);
    }
    if (people.length > MAX_PEOPLE) lines.push(`  ${fmt(t.waMorePeople, { count: people.length - MAX_PEOPLE })}`);
    if (speed) lines.push(`${d.summaryDelivery}: ${tr(speed.name, locale)}`);
    lines.push(`${t.itemTotal}: ${formatMoney(quote.total, locale)}`, "");
  });
  lines.push(`*${fmt(t.waTotal, { amount: formatMoney(total, locale) })}*`);
  if (images) lines.push("", t.waImages);
  return lines.join("\n");
}

/** A "send it to us" request as a WhatsApp message (files are attached in the chat itself). */
export function requestMessage(catalog: Catalog, r: Omit<CustomRequestInput, "locale">, locale: Locale, dict: Dictionary): string {
  const t = dict.send;
  const product = catalog.products.find((p) => p.id === r.productId);
  const lines = [t.waIntro[r.kind], ""];
  lines.push(`${t.name}: ${r.name}`);
  lines.push(`${t.phone}: ${normalizePhone(r.phone) ?? r.phone}`);
  lines.push(`${t.garment}: ${product ? tr(product.name, locale) : t.garmentAny}`);
  if (r.quantity) lines.push(`${t.waQuantity}: ${r.quantity}`);
  if (r.color) lines.push(`${t.colorCode}: ${r.color.hex}${r.color.name ? ` (${r.color.name})` : ""}`);
  if (r.size) {
    const s = r.size;
    lines.push(`${t.chest}: ${s.chest} cm`, `${t.length}: ${s.length} cm`);
    if (s.sleeve) lines.push(`${t.waSleeve}: ${s.sleeve} cm`);
    if (s.height) lines.push(`${t.waHeight}: ${s.height} cm`);
    if (s.weight) lines.push(`${t.waWeight}: ${s.weight} kg`);
    lines.push(`${t.sizeCount} ${s.count}`);
  }
  if (r.message) lines.push("", r.message);
  if (r.kind === "design") lines.push("", t.waFiles);
  if (r.kind === "color") lines.push("", t.waPhoto);
  return lines.join("\n");
}

/* ---------- Emails to the shop (always in English) ---------- */

export interface EmailContent {
  subject: string;
  fields: [string, string][];
}

const languageName = (locale: Locale) => (locale === "ar" ? "Arabic" : "English");

/** An order from the cart as email fields, one detail per line, and a subject that says what came in. */
export function orderEmail(catalog: Catalog, items: CartItem[], phone: string, customerLocale: Locale): EmailContent {
  const d = en.designer;
  const number = normalizePhone(phone) ?? phone;
  const fields: [string, string][] = [
    ["Customer WhatsApp", number],
    ["Customer's language", languageName(customerLocale)],
  ];
  let total = 0;
  let pieces = 0;
  items.forEach((item, index) => {
    const n = index + 1;
    const { design, quote } = priceItem(catalog, item.design, item.order);
    const info = describeDesign(catalog, design, "en", d);
    const sizes = effectiveSizes(item.order, design.personalization);
    const speed = catalog.deliverySpeeds.find((x) => x.id === item.order.deliverySpeedId);
    total += quote.total;
    pieces += quote.quantity;
    fields.push([`Design ${n}`, info.garment]);
    fields.push([`Design ${n} color`, info.colors.join(", ")]);
    fields.push([`Design ${n} prints`, info.prints.length ? info.prints.join(" / ") : d.noPrints]);
    if (info.personalization.length) fields.push([`Design ${n} names and numbers`, info.personalization.join(", ")]);
    fields.push([`Design ${n} pieces`, `${fmt(d.piecesTotal, { count: quote.quantity })} (${describeSizes(catalog, sizes)})`]);
    const people = item.order.roster.filter((r) => r.name || r.number);
    if (people.length) {
      fields.push([
        `Design ${n} people`,
        people.map((r) => [r.name, r.number, catalog.sizes.find((x) => x.id === r.sizeId)?.label ?? r.sizeId].filter(Boolean).join(" · ")).join("; "),
      ]);
    }
    if (speed) fields.push([`Design ${n} delivery`, tr(speed.name, "en")]);
    fields.push([`Design ${n} price`, formatMoney(quote.total, "en")]);
  });
  fields.push(["Total", formatMoney(total, "en")]);
  fields.push(["Pictures", "The front and back of each design are attached, with any images the customer uploaded."]);
  return { subject: `New order: ${pieces} pieces, ${formatMoney(total, "en")} (${number})`, fields };
}

const KIND_NAMES = { design: "their own design", color: "a color", size: "a custom size" } as const;

/** A "send it to us" request as email fields. */
export function requestEmail(catalog: Catalog, r: Omit<CustomRequestInput, "locale">, customerLocale: Locale): EmailContent {
  const t = en.send;
  const product = catalog.products.find((p) => p.id === r.productId);
  const number = normalizePhone(r.phone) ?? r.phone;
  const fields: [string, string][] = [
    ["Request", `Send it to us: ${KIND_NAMES[r.kind]}`],
    ["Name", r.name],
    ["Customer WhatsApp", number],
    ["Customer's language", languageName(customerLocale)],
    [t.garment, product ? tr(product.name, "en") : t.garmentAny],
  ];
  if (r.quantity) fields.push([t.waQuantity, String(r.quantity)]);
  if (r.color) fields.push([t.colorCode, `${r.color.hex}${r.color.name ? ` (${r.color.name})` : ""}`]);
  if (r.size) {
    const z = r.size;
    fields.push([t.chest, `${z.chest} cm`], [t.length, `${z.length} cm`]);
    if (z.sleeve) fields.push([t.waSleeve, `${z.sleeve} cm`]);
    if (z.height) fields.push([t.waHeight, `${z.height} cm`]);
    if (z.weight) fields.push([t.waWeight, `${z.weight} kg`]);
    fields.push([t.sizeCount, String(z.count)]);
  }
  if (r.message) fields.push(["Message", r.message]);
  return { subject: `New request: ${KIND_NAMES[r.kind]} from ${r.name} (${number})`, fields };
}
