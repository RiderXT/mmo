import type { CSSProperties } from "react";

/** Larger, four-corner sibling of inventory/SocketCorners — for framing whole panels (titled
 * "windows") rather than individual item sockets. Prototype-scoped: lives outside the shared
 * `.panel` class in index.css (which still uses the documented Two-Corner Rule) until the
 * ornate-window look is approved and promoted app-wide. Same inline-SVG grammar as SocketCorners
 * (currentColor stroke, hand-authored bracket + diamond), just bigger and on all 4 corners. */
function CornerBracket({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 20V8C2 4.7 4.7 2 8 2H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="0" y="0" width="4.2" height="4.2" rx="0.6" transform="rotate(45 2 2)" fill="currentColor" />
    </svg>
  );
}

export function PanelCorners({ size = 20, colorClassName = "text-gold" }: { size?: number; colorClassName?: string }) {
  const style = { width: size, height: size };
  return (
    <>
      <CornerBracket className={`pointer-events-none absolute -left-px -top-px ${colorClassName}`} style={style} />
      <CornerBracket
        className={`pointer-events-none absolute -right-px -top-px rotate-90 ${colorClassName}`}
        style={style}
      />
      <CornerBracket
        className={`pointer-events-none absolute -bottom-px -right-px rotate-180 ${colorClassName}`}
        style={style}
      />
      <CornerBracket
        className={`pointer-events-none absolute -bottom-px -left-px -rotate-90 ${colorClassName}`}
        style={style}
      />
    </>
  );
}
