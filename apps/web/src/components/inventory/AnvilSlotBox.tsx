import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

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
        className={`flex h-20 w-20 items-center justify-center border-2 border-dashed ${
          isOver ? "border-gold-bright bg-gold/10" : "border-gold/40"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px] text-parchment-faint">Kowadło</span>
    </div>
  );
}
