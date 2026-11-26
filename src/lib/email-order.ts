import type { CartItem } from "@/lib/cart/store";
import type { Catalog, Locale } from "@/lib/catalog/types";
import { priceItem } from "@/lib/checkout/plan";
import { getAsset } from "@/lib/design/assets";
import { useMeasureStore } from "@/lib/design/measure-store";
import { bodyHex } from "@/lib/design/options";
import { isPrintSide, panelBox, printRenderRect, renderPad, sideNames } from "@/lib/design/sides";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import type { PhotoView } from "@/lib/mockup/photos";
import type { CustomRequestInput } from "@/lib/validation";
import { orderEmail, requestEmail } from "@/lib/whatsapp-order";
import { en } from "@/i18n/dictionaries/en";
import { fitFiles, sendToInbox, type InboxFile } from "./email-inbox";

/** Emails an order from the cart to the shop, with pictures of every design (front and back) and the customer's own images. */
export async function emailOrder(catalog: Catalog, items: CartItem[], phone: string, customerLocale: Locale): Promise<void> {
  const { subject, fields } = orderEmail(catalog, items, phone, customerLocale);
  const files: InboxFile[] = [];
  for (const [index, item] of items.entries()) {
    const n = index + 1;
    const { design } = priceItem(catalog, item.design, item.order);
    const person = item.order.roster.find((r) => r.name || r.number);
    const samples: PrintSamples = { name: person?.name || en.designer.sampleName, number: person?.number || en.designer.sampleNumber };
    for (const view of ["front", "back"] as const) {
      const picture = await designPicture(catalog, design, view, samples).catch(() => null);
      if (picture) files.push({ name: `design-${n}-${view}.jpg`, blob: picture });
    }
    // Each print's artwork on its own, big and sharp, on the garment's color.
    const perSide = new Map<string, number>();
    for (const print of design.prints) {
      const count = (perSide.get(print.areaId) ?? 0) + 1;
      perSide.set(print.areaId, count);
      if (!print.elements?.length || !isPrintSide(print.areaId)) continue;
      const art = await printPicture(catalog, design, print).catch(() => null);
      const side = sideNames[print.areaId].en.toLowerCase().replace(/\s+/g, "-");
      if (art) files.push({ name: `design-${n}-print-${side}${count > 1 ? `-${count}` : ""}.jpg`, blob: art });
    }
    // The customer's own images, as they uploaded them (kept in this browser until now).
    for (const print of design.prints) {
      for (const el of print.elements ?? []) {
        if (el.type !== "image") continue;
        const blob = await getAsset(el.assetId).catch(() => null);
        if (blob) files.push({ name: `design-${n}-upload-${safeName(el.name)}`, blob });
      }
    }
  }
  const { kept, skipped } = fitFiles(files);
  if (skipped.length) fields.push(["Not attached (too big to email)", `${skipped.join(", ")}. Ask the customer to send them on WhatsApp.`]);
  await sendToInbox(subject, fields, kept);
}

/** Emails a "send it to us" request to the shop, with the customer's files. */
export async function emailRequest(catalog: Catalog, request: Omit<CustomRequestInput, "locale">, files: File[], customerLocale: Locale): Promise<void> {
  const { subject, fields } = requestEmail(catalog, request, customerLocale);
  const { kept, skipped } = fitFiles(files.map((f) => ({ name: f.name, blob: f })));
  if (skipped.length) fields.push(["Not attached (too big to email)", `${skipped.join(", ")}. Ask the customer to send them on WhatsApp.`]);
  await sendToInbox(subject, fields, kept);
}

/** The design on its garment photo as a JPEG (on white, which every email app shows). */
async function designPicture(catalog: Catalog, design: DesignSelection, view: PhotoView, samples: PrintSamples): Promise<Blob | null> {
  const { renderPhotoImage } = await import("@/lib/mockup/stills");
  const url = await renderPhotoImage(catalog, design, view, 800, 920, samples);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88));
}

const PATCHES: Record<string, "woven" | "chenille"> = { wovenPatch: "woven", chenillePatch: "chenille" };

/** One print's artwork as a JPEG on the garment's color, with a margin around it. */
async function printPicture(catalog: Catalog, design: DesignSelection, print: PrintSelection): Promise<Blob | null> {
  const product = catalog.products.find((p) => p.id === design.productId);
  if (!product || !isPrintSide(print.areaId) || !print.elements?.length) return null;
  const { drawPrintRect } = await import("@/lib/three/print-canvas");
  const patch = PATCHES[print.methodId] ?? null;
  const rect = printRenderRect(print.elements, panelBox(product.mockup, design.sleeve, print.areaId), useMeasureStore.getState().measurements, renderPad(Boolean(patch)));
  const art = await drawPrintRect(print.elements, rect, patch);
  const margin = Math.round(Math.max(art.width, art.height) * 0.06);
  const canvas = document.createElement("canvas");
  canvas.width = art.width + margin * 2;
  canvas.height = art.height + margin * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bodyHex(catalog, design);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(art, margin, margin);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-80) || "image";
}
