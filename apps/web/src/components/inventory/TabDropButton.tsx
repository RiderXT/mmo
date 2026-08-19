import { useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";

/** Inventory-tab switcher button that doubles as a dnd-kit drop zone — hovering a dragged item
 * over it (without releasing) switches to that tab, so the player can drag an item from tab I
 * straight into a slot on tab III without a separate click-then-drag step. The switch itself
 * happens on hover, not drop: `handleDragEnd`'s "tab" branch is a no-op, the actual placement
 * still requires dropping on a real grid/equip/active slot once the target tab is showing. */
export function TabDropButton({
  tab,
  active,
  label,
  title,
  count,
  onSelect,
}: {
  tab: number;
  active: boolean;
  label: string;
  title: string;
  /** Item count badge — omitted entirely (no badge) when undefined. */
  count?: number;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tab-${tab}`,
    data: { type: "tab", tab },
  });

  useEffect(() => {
    if (isOver) onSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={`relative flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
        active ? "bg-gold text-ink" : "bg-panel-raised text-parchment-dim hover:bg-line-soft"
      } ${count === undefined || count > 0 ? "" : "opacity-60"} ${isOver ? "ring-2 ring-gold-bright" : ""}`}
      title={title}
      aria-label={title}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full border border-line-soft bg-ink px-0.5 text-[9px] font-semibold leading-none text-gold-bright"
        >
          {count}
        </span>
      )}
    </button>
  );
}
