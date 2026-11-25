"use client";

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { assetUrl } from "@/lib/design/assets";
import { clipartById } from "@/lib/design/clipart";
import { fontById, hasArabic } from "@/lib/design/fonts";
import { namesGrid } from "@/lib/design/personalization";
import type { LocalBBox } from "@/lib/design/geometry";
import type { DesignElement, TextElement } from "@/lib/design/types";
import type { PersonalStyle } from "@/lib/pricing/types";
import { inkBounds } from "@/lib/ink-bounds";

/**
 * Draws print artwork onto a canvas at real print proportions (mm × scale),
 * matching what the flat editor shows. The canvas becomes the texture on the
 * 3D garment.
 */

const MAX_PX = 2048;

export function pxPerMm(wMm: number, hMm: number): number {
  return Math.min(8, MAX_PX / Math.max(wMm, hMm, 1));
}

function makeCanvas(wMm: number, hMm: number) {
  const k = pxPerMm(wMm, hMm);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(wMm * k));
  canvas.height = Math.max(2, Math.round(hMm * k));
  return { canvas, ctx: canvas.getContext("2d")!, k };
}

/** CSS font stacks may use the site's font variables; canvas needs the real names. */
function resolveFamily(family: string): string {
  return family.replace(/var\((--[\w-]+)\)/g, (_, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "sans-serif");
}

async function loadFont(fontId: string, text: string) {
  const f = fontById(fontId);
  const family = resolveFamily(f.family);
  try {
    await document.fonts.load(`${f.weight} 48px ${family}`, text || "A");
  } catch {
    // Fall back to whatever the browser has.
  }
  return { family, weight: f.weight };
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = src;
  return img.decode().then(
    () => img,
    () => null,
  );
}

function assetImage(id: string) {
  let p = images.get(id);
  if (!p) {
    p = assetUrl(id).then((url) => (url ? loadImage(url) : null));
    images.set(id, p);
  }
  return p;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** Clip-art is drawn by React as SVG; turn that markup into an image once per color. */
function clipartImage(id: string, color: string) {
  const key = `clip:${id}:${color}`;
  let p = images.get(key);
  if (!p) {
    const art = clipartById(id);
    if (!art) return Promise.resolve(null);
    if (!host) {
      host = document.createElement("div");
      root = createRoot(host);
    }
    flushSync(() =>
      root!.render(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 1 1" width="512" height="512">
          {art.render(color)}
        </svg>,
      ),
    );
    const markup = host.innerHTML;
    p = loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    images.set(key, p);
  }
  return p;
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement, k: number, family: string, weight: number) {
  const px = el.size * k;
  const rtl = hasArabic(el.text);
  const spacing = rtl ? 0 : el.letterSpacing * px;
  ctx.font = `${weight} ${px}px ${family}`;
  ctx.fillStyle = el.color;
  ctx.strokeStyle = el.outlineColor;
  ctx.lineJoin = "round";
  const strokeW = el.outline ? el.size * (el.outline === 1 ? 0.06 : 0.12) * k : 0;
  ctx.lineWidth = strokeW;
  ctx.direction = rtl ? "rtl" : "ltr";
  const paint = (text: string, x: number, y: number) => {
    if (strokeW) ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  };

  if (el.curve === 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    paint(el.text, 0, 0);
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
    return;
  }

  // Curved: Latin letter by letter, Arabic word by word (keeps letters joined).
  const pieces = rtl ? el.text.split(/(\s+)/).filter(Boolean) : [...el.text];
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const widths = pieces.map((p) => ctx.measureText(p).width + spacing);
  const total = Math.max(1, widths.reduce((a, b) => a + b, 0));
  const theta = (Math.abs(el.curve) / 100) * Math.PI * 1.5;
  const r = total / theta;
  const offset = px * 0.35;
  const order = rtl ? [...pieces.keys()].reverse() : [...pieces.keys()];
  let pos = -total / 2;
  for (const i of order) {
    const w = widths[i]!;
    const phi = (pos + w / 2) / r;
    pos += w;
    ctx.save();
    if (el.curve > 0) {
      ctx.translate(r * Math.sin(phi), offset + r - r * Math.cos(phi));
      ctx.rotate(phi);
    } else {
      ctx.translate(r * Math.sin(phi), offset - r + r * Math.cos(phi));
      ctx.rotate(-phi);
    }
    paint(pieces[i]!, 0, 0);
    ctx.restore();
  }
}

export type PatchStyle = "woven" | "chenille" | null;

/** Artwork for one print box. Patches get their fabric base and stitched edge. */
export async function drawPrintCanvas(elements: DesignElement[], wMm: number, hMm: number, patch: PatchStyle = null): Promise<HTMLCanvasElement> {
  const { canvas, ctx, k } = makeCanvas(wMm, hMm);
  if (!patch) {
    await drawElements(ctx, elements, k);
    return canvas;
  }
  // A patch is cut around the artwork as it really shows. Fonts with swashes (script fonts) reach
  // past their letter boxes, so a patch sized from the boxes would leave the text off-centre.
  const art = makeCanvas(wMm, hMm);
  await drawElements(art.ctx, elements, k);
  const ink = inkBounds(art.canvas);
  const margin = PATCH_MARGIN_MM * k;
  const box = ink
    ? {
        x0: Math.max(0, ink.x - margin),
        y0: Math.max(0, ink.y - margin),
        x1: Math.min(canvas.width, ink.x + ink.w + margin),
        y1: Math.min(canvas.height, ink.y + ink.h + margin),
      }
    : { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height };
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const rim = Math.max(2, Math.min(bw, bh) * 0.04);
  ctx.fillStyle = patch === "woven" ? "#f1e9d8" : "#efe4cc";
  ctx.beginPath();
  ctx.roundRect(box.x0 + rim, box.y0 + rim, bw - rim * 2, bh - rim * 2, Math.min(bw, bh) * 0.12);
  ctx.fill();
  ctx.lineWidth = rim * 1.2;
  ctx.strokeStyle = patch === "woven" ? "#7a0a0a" : "#c9a227";
  ctx.stroke();
  ctx.drawImage(art.canvas, 0, 0);
  return canvas;
}

/** Room (mm) between a patch's edge and the artwork on it. */
const PATCH_MARGIN_MM = 4.5;

async function drawElements(ctx: CanvasRenderingContext2D, elements: DesignElement[], k: number) {
  for (const el of elements) {
    ctx.save();
    ctx.translate(el.x * k, el.y * k);
    ctx.rotate((el.rotation * Math.PI) / 180);
    if (el.type === "image") {
      const img = await assetImage(el.assetId);
      const h = el.w * el.aspect;
      if (img) ctx.drawImage(img, (-el.w / 2) * k, (-h / 2) * k, el.w * k, h * k);
    } else if (el.type === "clipart") {
      const img = await clipartImage(el.clipartId, el.color);
      if (img) ctx.drawImage(img, (-el.w / 2) * k, (-el.w / 2) * k, el.w * k, el.w * k);
    } else {
      const { family, weight } = await loadFont(el.fontId, el.text);
      drawText(ctx, el, k, family, weight);
    }
    ctx.restore();
  }
}

/** A print's artwork cut to a rectangle of its panel (mm), ready to lay on the garment. */
export function drawPrintRect(elements: DesignElement[], rect: LocalBBox, patch: PatchStyle = null): Promise<HTMLCanvasElement> {
  const shifted = elements.map((el) => ({ ...el, x: el.x - rect.x, y: el.y - rect.y }));
  return drawPrintCanvas(shifted, rect.w, rect.h, patch);
}

/** Dashed outline shown where a print will go before artwork is added. */
export function placeholderCanvas(wMm: number, hMm: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(wMm, hMm);
  const lw = Math.max(3, canvas.width * 0.012);
  ctx.fillStyle = "rgba(201,162,39,0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setLineDash([lw * 4, lw * 3]);
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(226,199,102,0.95)";
  ctx.strokeRect(lw, lw, canvas.width - lw * 2, canvas.height - lw * 2);
  const s = Math.min(canvas.width, canvas.height) * 0.14;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = "rgba(226,199,102,0.95)";
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.fill();
  return canvas;
}

/** One name or number, as large as the style allows while fitting the area. Tall areas (sleeves) run it lengthwise. */
export async function drawPersonalText(text: string, style: PersonalStyle, wMm: number, hMm: number): Promise<HTMLCanvasElement> {
  const { canvas, ctx, k } = makeCanvas(wMm, hMm);
  const { family, weight } = await loadFont(style.fontId, text);
  const vertical = hMm > wMm * 1.8;
  const along = vertical ? hMm : wMm;
  const across = vertical ? wMm : hMm;
  let size = style.sizeMm;
  const estimate = Math.max(1, text.length) * size * 0.6;
  if (estimate > along * 0.92) size *= (along * 0.92) / estimate;
  size = Math.min(size, across * 0.85);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.font = `${weight} ${size * k}px ${family}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = hasArabic(text) ? "rtl" : "ltr";
  ctx.fillText(text, 0, 0);
  return canvas;
}

/** The class names list laid out in a grid. */
export async function drawNamesList(names: string[], style: PersonalStyle, wMm: number, hMm: number): Promise<HTMLCanvasElement> {
  const { canvas, ctx, k } = makeCanvas(wMm, hMm);
  if (!names.length) return canvas;
  const { family, weight } = await loadFont(style.fontId, names.join(" "));
  const grid = namesGrid(names, wMm * 0.94, hMm * 0.94);
  const font = Math.min(grid.fontSize, 25);
  const cellW = (wMm * 0.94) / grid.columns;
  const cellH = Math.min((hMm * 0.94) / Math.max(grid.rows, 1), font * 1.6);
  const left = wMm * 0.03;
  const top = (hMm - cellH * grid.rows) / 2;
  ctx.font = `${weight} ${font * k}px ${family}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  names.forEach((n, i) => {
    const col = i % grid.columns;
    const row = Math.floor(i / grid.columns);
    ctx.direction = hasArabic(n) ? "rtl" : "ltr";
    ctx.fillText(n, (left + (col + 0.5) * cellW) * k, (top + (row + 0.5) * cellH) * k);
  });
  return canvas;
}

/** Small woven label inside the back neck. */
export function drawNeckLabel(text: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(50, 20);
  ctx.fillStyle = "#f5ebd8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#7a0a0a";
  ctx.font = `700 ${canvas.height * 0.42}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((text || "ARCANE").slice(0, 18), canvas.width / 2, canvas.height / 2, canvas.width * 0.9);
  return canvas;
}
