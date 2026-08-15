import type { ItemType } from "@mmo/shared";

/** Simple placeholder glyph per item type — deliberately plain/thin-lined, standing in until
 * real per-item artwork is added. */
const ICON_PATHS: Record<ItemType, string> = {
  weapon: "M4 20 L15 9 M13 6 L18 11 M15 4 L20 9 M4 20 L6 18",
  armor: "M12 3 L19 6 V12 C19 17 15.5 20 12 21 C8.5 20 5 17 5 12 V6 Z",
  helmet: "M5 13 C5 7 8 4 12 4 C16 4 19 7 19 13 V16 H5 Z M8 16 V19 H16 V16",
  boots: "M8 3 V13 H6 C5 13 4 14 4 15.5 V20 H14 V17 C14 15 12.5 14.5 11 14.5 H10 V3 Z",
  necklace: "M4 5 C4 11 9 15 12 15 C15 15 20 11 20 5 M12 15 L12 18 M9.5 19 A2.5 2.5 0 1 0 14.5 19 A2.5 2.5 0 1 0 9.5 19",
  earrings: "M8 4 V8 A2 2 0 0 0 12 8 V4 M8 6 H4 V10 A4 4 0 0 0 8 14 M16 4 V8 A2 2 0 0 1 12 8 M16 6 H20 V10 A4 4 0 0 1 16 14",
  ring: "M12 15 A5 5 0 1 0 12 5 A5 5 0 1 0 12 15 Z M9.5 6 L12 2 L14.5 6",
  consumable: "M9 3 H15 M10 3 V7 L6 15 C5 17 6.5 19 9 19 H15 C17.5 19 19 17 18 15 L14 7 V3",
  material: "M12 3 L20 8 V16 L12 21 L4 16 V8 Z M4 8 L12 13 L20 8 M12 13 V21",
  quest: "M12 3 C15 3 17 5 17 7.5 C17 10 14.5 10.5 13 12 C12.5 12.5 12 13.5 12 15 M12 18.5 V19",
  chest: "M4 9 H20 V19 H4 Z M4 9 C4 6 6 5 8 5 H16 C18 5 20 6 20 9 M10 13 H14 M9 5 V9 M15 5 V9",
};

export function ItemTypeIcon({ type, className }: { type: ItemType; className?: string }) {
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
      <path d={ICON_PATHS[type]} />
    </svg>
  );
}
