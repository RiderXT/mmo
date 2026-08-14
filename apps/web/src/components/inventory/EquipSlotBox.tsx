import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { EquipSlot } from "@mmo/shared";

const LABELS: Record<EquipSlot, string> = {
  weapon: "Broń",
  armor: "Zbroja",
  helmet: "Hełm",
  boots: "Buty",
  necklace: "Naszyjnik",
  earrings: "Kolczyki",
  ring: "Pierścień",
};

export function EquipSlotBox({ slot, children }: { slot: EquipSlot; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `equip-${slot}`,
    data: { type: "equip", equipSlot: slot },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={setNodeRef}
        className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed ${
          isOver ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px] text-slate-500">{LABELS[slot]}</span>
    </div>
  );
}
