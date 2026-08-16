import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

export function GridSlot({ slotIndex, children }: { slotIndex: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `grid-${slotIndex}`,
    data: { type: "grid", slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-14 w-14 items-center justify-center border border-dashed shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)] transition ${
        isOver ? "border-gold-bright bg-gold/10 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45),0_0_8px_oklch(76%_0.09_85_/_0.35)]" : "border-line"
      }`}
    >
      {children}
    </div>
  );
}
