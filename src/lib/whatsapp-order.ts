import type { CartItem } from "@/lib/cart/store";
import { tr } from "@/lib/catalog";
import type { Catalog, Locale } from "@/lib/catalog/types";
import { priceItem } from "@/lib/checkout/plan";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { effectiveSizes } from "@/lib/order/roster";
import type { CustomRequestInput } from "@/lib/validation";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt, formatMoney } from "@/i18n/format";

/**
 * Messages for the GitHub Pages copy of the site, which has no server: the
 * cart and the "send it to us" forms open WhatsApp with everything filled in.
 */

const MAX_PEOPLE = 60;

/** The whole cart as one WhatsApp message: each piece, its sizes and price, and the total. */
export function orderMessage(catalog: Catalog, items: CartItem[], locale: Locale, dict: Dictionary): string {
  const t = dict.cart;
  const d = dict.designer;
  const lines: string[] = [t.waIntro, ""];
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
export function requestMessage(catalog: Catalog, r: Omit<CustomRequestInput, "phone" | "locale">, locale: Locale, dict: Dictionary): string {
  const t = dict.send;
  const product = catalog.products.find((p) => p.id === r.productId);
  const lines = [t.waIntro[r.kind], ""];
  lines.push(`${t.name}: ${r.name}`);
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
