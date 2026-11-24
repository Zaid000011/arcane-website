const STAR = "M0,-1 Q0,0 1,0 Q0,0 0,1 Q0,0 -1,0 Q0,0 0,-1 Z";

/**
 * The main Arcane logo: a round seal with SENIORS ✦ CLUBS ✦ UNIFORMS ✦ MERCH
 * on the top arc, STUDIOS on the bottom arc and ARCANE in the center.
 * Mirrors /public/brand/logo-seal.svg but uses the site's loaded fonts.
 */
export function Seal({ className, id = "seal", title = "Arcane Studios" }: { className?: string; id?: string; title?: string }) {
  const top = `${id}-top`;
  const bottom = `${id}-bottom`;
  return (
    <svg viewBox="0 0 500 500" className={className} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{title}</title>
      <defs>
        <path id={top} d="M66,250 A184,184 0 0,1 434,250" />
        <path id={bottom} d="M52,250 A198,198 0 0,0 448,250" />
      </defs>
      <circle cx="250" cy="250" r="245" fill="#7A0A0A" />
      <circle cx="250" cy="250" r="230" fill="none" stroke="#C9A227" strokeWidth="3" />
      <circle cx="250" cy="250" r="160" fill="none" stroke="#C9A227" strokeWidth="1.5" />
      <text fill="#C9A227" fontSize="21" fontWeight="700" style={{ fontFamily: "var(--font-cinzel), serif" }} direction="ltr">
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle" textLength="470" lengthAdjust="spacing">
          SENIORS ✦ CLUBS ✦ UNIFORMS ✦ MERCH
        </textPath>
      </text>
      <text fill="#C9A227" fontSize="28" fontWeight="700" letterSpacing="12" style={{ fontFamily: "var(--font-cinzel), serif" }} direction="ltr">
        <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
          STUDIOS
        </textPath>
      </text>
      <path d={STAR} transform="translate(56 250) scale(9)" fill="#C9A227" />
      <path d={STAR} transform="translate(444 250) scale(9)" fill="#C9A227" />
      <text
        x="250"
        y="290"
        textAnchor="middle"
        fontSize="100"
        letterSpacing="2"
        fill="#C9A227"
        style={{ fontFamily: "var(--font-anton), Impact, sans-serif" }}
        direction="ltr"
      >
        ARCANE
      </text>
    </svg>
  );
}
