/** Two hand-authored placeholder glyphs for the expedition map's waypoints — town vs wild zone
 * is the only distinction the data model carries (Zone.isTown), so that's all these encode. Same
 * inline-SVG grammar as inventory/ItemTypeIcon.tsx (24x24 viewBox, currentColor stroke, no
 * fill) rather than emoji, for visual consistency with the rest of the icon system. */
export function CampfireGlyph({ className }: { className?: string }) {
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
      <path d="M12 3 C8.2 8 6.3 11.8 6.3 15.3 C6.3 18.9 8.8 21 12 21 C15.2 21 17.7 18.9 17.7 15.3 C17.7 11.8 15.8 8 12 3 Z" />
      <path d="M12 10.5 C10.4 12.9 9.6 14.6 9.6 16 C9.6 17.7 10.7 19 12 19 C13.3 19 14.4 17.7 14.4 16 C14.4 14.6 13.6 12.9 12 10.5 Z" />
    </svg>
  );
}

export function WildZoneGlyph({ className }: { className?: string }) {
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
      <path d="M12 3 L17 11 H14.3 L18.5 17 H5.5 L9.7 11 H7 Z" />
      <path d="M12 17 V21" />
    </svg>
  );
}
