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
      className={`flex h-14 w-14 items-center justify-center  border border-dashed ${
        isOver ? "border-gold-bright bg-gold/10" : "border-line"
      }`}
    >
      {children}
    </div>
  );
}
