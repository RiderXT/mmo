import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

export function ActiveItemSlotBox({ slotIndex, children }: { slotIndex: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `active-${slotIndex}`,
    data: { type: "active", slotIndex },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={setNodeRef}
        className={`flex h-14 w-14 items-center justify-center border-2 border-dashed shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)] transition ${
          isOver
            ? "border-gold-bright bg-gold/10 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45),0_0_8px_oklch(76%_0.09_85_/_0.35)]"
            : "border-line-soft"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px] text-parchment-faint">Slot {slotIndex + 1}</span>
    </div>
  );
}
