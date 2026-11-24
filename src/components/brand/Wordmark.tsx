import { Star } from "./Star";

/** Star + ARCANE on one line, for the header. Always Latin, even in Arabic. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span dir="ltr" className={`inline-flex items-center gap-2 text-gold ${className}`}>
      <Star className="h-[0.7em] w-[0.7em]" />
      <span className="font-brand leading-none tracking-[0.08em]">ARCANE</span>
    </span>
  );
}
