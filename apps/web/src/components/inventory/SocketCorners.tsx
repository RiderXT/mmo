import type { CSSProperties } from "react";

/** Small engraved corner bracket for item sockets — the "kratki ekwipunku" counterpart to the
 * .panel Two-Corner Rule brackets in index.css (top-left + bottom-right only). Hand-authored to
 * match the app's inline-SVG icon grammar (see ItemTypeIcon.tsx/CombatIcon.tsx: currentColor
 * stroke, no fill) instead of importing outside artwork, and reuses the rotated-diamond motif
 * already established in AppShell.tsx's SectionTitle bullet. */
function CornerBracket({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M1.2 11V5.2C1.2 3 3 1.2 5.2 1.2H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="0" y="0" width="2.6" height="2.6" rx="0.4" transform="rotate(45 1.2 1.2)" fill="currentColor" />
    </svg>
  );
}

export function SocketCorners({ size = 10 }: { size?: number }) {
  const style = { width: size, height: size };
  return (
    <>
      <CornerBracket className="pointer-events-none absolute -left-px -top-px text-gold/70" style={style} />
      <CornerBracket
        className="pointer-events-none absolute -bottom-px -right-px rotate-180 text-gold/70"
        style={style}
      />
    </>
  );
}
