/**
 * Artwork placed inside a print box. All lengths are millimetres, measured
 * from the print box's top-left corner (x, y = the element's center).
 */

interface BaseElement {
  id: string;
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  locked?: boolean;
}

export interface ImageElement extends BaseElement {
  type: "image";
  assetId: string;
  name: string;
  /** Printed width in mm. Height = w × aspect. */
  w: number;
  aspect: number;
  /** Source pixel size, used for the print-quality (DPI) check. */
  pxW: number;
  pxH: number;
  /** SVG artwork scales without quality loss. */
  vector: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontId: string;
  /** Font size in mm. */
  size: number;
  color: string;
  /** 0 = none, 1 = thin, 2 = thick. */
  outline: 0 | 1 | 2;
  outlineColor: string;
  /** Extra space between letters, in em. */
  letterSpacing: number;
  /** −100 (smile) … 0 (straight) … 100 (rainbow arch). */
  curve: number;
}

export interface ClipartElement extends BaseElement {
  type: "clipart";
  clipartId: string;
  /** Width and height in mm. */
  w: number;
  color: string;
}

export type DesignElement = ImageElement | TextElement | ClipartElement;

export function newElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
