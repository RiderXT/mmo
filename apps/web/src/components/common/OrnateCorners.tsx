import type { CSSProperties } from "react";

/** Heavier, more ornate sibling of PanelCorners — a double-line bracket (outer full-strength
 * stroke + inner dimmer offset stroke) with a curled flourish tail and a diamond accent, plus a
 * companion inset rule (see PanelFrame's `cornerStyle="ornate"`) for a nested picture-frame
 * look. Scoped to surfaces that want to closely match a heavily-framed reference (currently just
 * the expedition map) — PanelCorners stays the app-wide default. Same inline-SVG grammar as
 * PanelCorners/SocketCorners (currentColor stroke, hand-authored, no icon library, no emoji). */
function OrnateBracket({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 27V11C2 6.03 6.03 2 11 2H27" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M7 27V13.5C7 9.9 9.9 7 13.5 7H27"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path d="M2 27C2 30.3 4.7 33 8 33" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M27 2C30.3 2 33 4.7 33 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="0" y="0" width="5" height="5" rx="0.7" transform="rotate(45 2 2)" fill="currentColor" />
    </svg>
  );
}

export function OrnateCorners({ size = 34, colorClassName = "text-gold" }: { size?: number; colorClassName?: string }) {
  const style = { width: size, height: size };
  return (
    <>
      <OrnateBracket className={`pointer-events-none absolute -left-px -top-px ${colorClassName}`} style={style} />
      <OrnateBracket
        className={`pointer-events-none absolute -right-px -top-px rotate-90 ${colorClassName}`}
        style={style}
      />
      <OrnateBracket
        className={`pointer-events-none absolute -bottom-px -right-px rotate-180 ${colorClassName}`}
        style={style}
      />
      <OrnateBracket
        className={`pointer-events-none absolute -bottom-px -left-px -rotate-90 ${colorClassName}`}
        style={style}
      />
    </>
  );
}
