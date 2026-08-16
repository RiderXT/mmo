export type CombatIconKind =
  | "attack"
  | "evade"
  | "impact"
  | "skill"
  | "potion"
  | "defeat"
  | "time"
  | "victory"
  | "target";

/** Combat-log glyphs, drawn in the same stroke grammar as ItemTypeIcon (viewBox 0 0 24 24,
 * strokeWidth 1.4, round caps/joins) instead of emoji — keeps the log's iconography consistent
 * with the rest of the inventory/combat UI rather than borrowing a second, inconsistent
 * "icon system" from the platform's emoji font. */
const ICON_SHAPES: Record<CombatIconKind, React.ReactNode> = {
  attack: <path d="M4 20 L15 9 M13 6 L18 11 M15 4 L20 9 M4 20 L6 18" />,
  evade: <path d="M12 3 L19 6 V12 C19 17 15.5 20 12 21 C8.5 20 5 17 5 12 V6 Z" />,
  impact: <path d="M12 3 L12 9 M12 15 L12 21 M3 12 L9 12 M15 12 L21 12" />,
  skill: <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />,
  potion: <path d="M9 3 H15 M10 3 V7 L6 15 C5 17 6.5 19 9 19 H15 C17.5 19 19 17 18 15 L14 7 V3" />,
  defeat: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8.5 L15.5 15.5 M15.5 8.5 L8.5 15.5" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7 V12 L15.5 14" />
    </>
  ),
  victory: <polyline points="4,13 9,18 20,6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

export function CombatIcon({ kind, className }: { kind: CombatIconKind; className?: string }) {
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
      {ICON_SHAPES[kind]}
    </svg>
  );
}
