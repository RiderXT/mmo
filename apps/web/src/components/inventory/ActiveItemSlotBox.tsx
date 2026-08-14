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
        className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed ${
          isOver ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px] text-slate-500">Slot {slotIndex + 1}</span>
    </div>
  );
}
