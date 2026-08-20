import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SocketCorners } from "./SocketCorners";

/** The single drop target on the Kowadło (anvil) tab — dragging an item here selects it for
 * upgrading, exactly like clicking it in the grid/equip row does. Visually mirrors
 * EquipSlotBox/ActiveItemSlotBox but with its own droppable id/type ("anvil"). */
export function AnvilSlotBox({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "anvil-slot",
    data: { type: "anvil" },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={setNodeRef}
        className={`relative flex h-20 w-20 items-center justify-center border-2 shadow-[inset_0_1px_6px_rgba(0,0,0,0.5)] transition ${
          isOver
            ? "border-gold-bright bg-gold/30 shadow-[inset_0_1px_6px_rgba(0,0,0,0.5),0_0_20px_oklch(76%_0.09_85_/_0.75)]"
            : "border-transparent shadow-[inset_0_1px_6px_rgba(0,0,0,0.5),0_0_6px_oklch(76%_0.09_85_/_0.15)]"
        }`}
      >
        {children}
        <SocketCorners size={14} />
      </div>
      <span className="text-xs text-parchment-faint">Kowadło</span>
    </div>
  );
}
