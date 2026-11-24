import { tierLabels, tr } from "@/lib/catalog";
import type { Catalog, Locale, SizeTier } from "@/lib/catalog/types";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
/** Any pricing or artwork issue that has a translated message. */
export interface AnyIssue {
  code: keyof Dictionary["issues"];
  severity: "error" | "warning";
  params?: Record<string, string | number>;
}

/** Turns a pricing or artwork issue into a readable, translated sentence. */
export function issueMessage(issue: AnyIssue, dict: Dictionary, catalog: Catalog, locale: Locale): string {
  const p = issue.params ?? {};
  const name = (text: { en: string; ar: string } | undefined, fallback: unknown) => (text ? tr(text, locale) : String(fallback ?? ""));
  const values: Record<string, string | number> = { ...p };
  if (p.methodId !== undefined) values.method = name(catalog.printMethods.find((m) => m.id === p.methodId)?.name, p.methodId);
  if (p.areaId !== undefined) values.area = name(catalog.printAreas.find((a) => a.id === p.areaId)?.name, p.areaId);
  if (p.colorId !== undefined) values.color = name(catalog.colors.find((c) => c.id === p.colorId)?.name, p.colorId);
  if (p.fabricId !== undefined) {
    const fabric = catalog.products.flatMap((prod) => prod.fabrics).find((f) => f.id === p.fabricId);
    values.fabric = name(fabric?.name, p.fabricId);
  }
  for (const key of ["tier", "maxTier"] as const) {
    const tier = p[key] as SizeTier | undefined;
    if (tier && tierLabels[tier]) values[key] = tr(tierLabels[tier], locale);
  }
  return fmt(dict.issues[issue.code], values);
}
