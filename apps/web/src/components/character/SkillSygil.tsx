/** Single placeholder glyph for every skill-tree tile (root skills and upgrade nodes alike) —
 * deliberately plain, standing in until real per-skill artwork is designed. Matches the app's
 * inline-SVG icon grammar (see inventory/ItemTypeIcon.tsx: currentColor stroke, no fill) so
 * swapping in per-skill icons later is a lookup-table change, not a redesign. */
export function SkillSygil({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3 L14.5 9.5 L21 12 L14.5 14.5 L12 21 L9.5 14.5 L3 12 L9.5 9.5 Z" />
    </svg>
  );
}

/** Padlock glyph for a not-yet-available tile (prerequisite unmet, or the parent skill itself
 * still locked) — same drawing style as SkillSygil. */
export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11 V7 A4 4 0 0 1 16 7 V11" />
    </svg>
  );
}
