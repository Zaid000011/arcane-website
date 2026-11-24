import {
  Anchor,
  Atom,
  Award,
  BookOpen,
  Crown,
  Dumbbell,
  Eye,
  Feather,
  Flame,
  Gem,
  GraduationCap,
  Heart,
  Medal,
  Moon,
  Music,
  Palette,
  PawPrint,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sun,
  Swords,
  Trophy,
  Volleyball,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LocalizedText } from "@/lib/catalog/types";

/**
 * Clip-art drawn in a 1 × 1 box centered on 0,0 (the element scales it to its size in mm).
 */
export interface Clipart {
  id: string;
  name: LocalizedText;
  render: (color: string) => ReactNode;
}

const STAR4 = "M0,-0.5 Q0,0 0.5,0 Q0,0 0,0.5 Q0,0 -0.5,0 Q0,0 0,-0.5 Z";

function laurel(color: string): ReactNode {
  const r = 0.36;
  const cy = 0.06;
  const leaves: ReactNode[] = [];
  for (let i = 0; i < 8; i++) {
    const deg = 105 + i * 19;
    const a = (deg * Math.PI) / 180;
    const x = r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const tilt = deg + 90 + (i % 2 ? 28 : -28);
    const out = i % 2 ? 0.035 : -0.035;
    leaves.push(
      <ellipse key={`l${i}`} cx={x + out * Math.cos(a)} cy={y + out * Math.sin(a)} rx={0.085} ry={0.034} transform={`rotate(${tilt} ${x + out * Math.cos(a)} ${y + out * Math.sin(a)})`} fill={color} />,
    );
  }
  const branch = (
    <>
      <path d={`M${r * Math.cos((100 * Math.PI) / 180)},${cy + r * Math.sin((100 * Math.PI) / 180)} A${r},${r} 0 0,1 ${r * Math.cos((250 * Math.PI) / 180)},${cy + r * Math.sin((250 * Math.PI) / 180)}`} fill="none" stroke={color} strokeWidth={0.025} strokeLinecap="round" />
      {leaves}
    </>
  );
  return (
    <>
      <g>{branch}</g>
      <g transform="scale(-1 1)">{branch}</g>
    </>
  );
}

function icon(Icon: LucideIcon) {
  // Lucide icons are 24-unit stroke icons; draw them in the unit box.
  return (color: string) => <Icon x={-0.5} y={-0.5} width={1} height={1} color={color} strokeWidth={2} absoluteStrokeWidth={false} />;
}

export const clipartLibrary: Clipart[] = [
  { id: "arcaneStar", name: { en: "Arcane star", ar: "نجمة أركين" }, render: (c) => <path d={STAR4} fill={c} /> },
  { id: "laurel", name: { en: "Laurel wreath", ar: "إكليل الغار" }, render: laurel },
  { id: "graduationCap", name: { en: "Graduation cap", ar: "قبعة التخرج" }, render: icon(GraduationCap) },
  { id: "crown", name: { en: "Crown", ar: "تاج" }, render: icon(Crown) },
  { id: "trophy", name: { en: "Trophy", ar: "كأس" }, render: icon(Trophy) },
  { id: "medal", name: { en: "Medal", ar: "ميدالية" }, render: icon(Medal) },
  { id: "award", name: { en: "Award", ar: "جائزة" }, render: icon(Award) },
  { id: "star", name: { en: "Star", ar: "نجمة" }, render: icon(Star) },
  { id: "sparkles", name: { en: "Sparkles", ar: "لمعان" }, render: icon(Sparkles) },
  { id: "moon", name: { en: "Moon", ar: "هلال" }, render: icon(Moon) },
  { id: "sun", name: { en: "Sun", ar: "شمس" }, render: icon(Sun) },
  { id: "eye", name: { en: "Eye", ar: "عين" }, render: icon(Eye) },
  { id: "flame", name: { en: "Flame", ar: "شعلة" }, render: icon(Flame) },
  { id: "zap", name: { en: "Lightning", ar: "برق" }, render: icon(Zap) },
  { id: "heart", name: { en: "Heart", ar: "قلب" }, render: icon(Heart) },
  { id: "gem", name: { en: "Gem", ar: "جوهرة" }, render: icon(Gem) },
  { id: "shield", name: { en: "Shield", ar: "درع" }, render: icon(Shield) },
  { id: "swords", name: { en: "Swords", ar: "سيفان" }, render: icon(Swords) },
  { id: "skull", name: { en: "Skull", ar: "جمجمة" }, render: icon(Skull) },
  { id: "feather", name: { en: "Feather", ar: "ريشة" }, render: icon(Feather) },
  { id: "bookOpen", name: { en: "Book", ar: "كتاب" }, render: icon(BookOpen) },
  { id: "atom", name: { en: "Atom", ar: "ذرة" }, render: icon(Atom) },
  { id: "palette", name: { en: "Palette", ar: "ألوان رسم" }, render: icon(Palette) },
  { id: "music", name: { en: "Music", ar: "موسيقى" }, render: icon(Music) },
  { id: "rocket", name: { en: "Rocket", ar: "صاروخ" }, render: icon(Rocket) },
  { id: "anchor", name: { en: "Anchor", ar: "مرساة" }, render: icon(Anchor) },
  { id: "pawPrint", name: { en: "Paw print", ar: "أثر مخلب" }, render: icon(PawPrint) },
  { id: "dumbbell", name: { en: "Dumbbell", ar: "دمبل" }, render: icon(Dumbbell) },
  { id: "volleyball", name: { en: "Ball", ar: "كرة" }, render: icon(Volleyball) },
];

export function clipartById(id: string): Clipart | undefined {
  return clipartLibrary.find((c) => c.id === id);
}
