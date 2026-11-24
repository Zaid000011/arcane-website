/** The four-point star used across the brand. */
export function Star({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-1 -1 2 2" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d="M0,-1 Q0,0 1,0 Q0,0 0,1 Q0,0 -1,0 Q0,0 0,-1 Z" fill="currentColor" />
    </svg>
  );
}
