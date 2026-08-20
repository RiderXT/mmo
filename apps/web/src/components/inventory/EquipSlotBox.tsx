import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { EquipSlot } from "@mmo/shared";
import { SocketCorners } from "./SocketCorners";

const LABELS: Record<EquipSlot, string> = {
  weapon: "Broń",
  armor: "Zbroja",
  helmet: "Hełm",
  boots: "Buty",
  shield: "Tarcza",
  necklace: "Naszyjnik",
  earrings: "Kolczyki",
  ring: "Pierścień",
  rod: "Wędka",
  pickaxe: "Kilof",
};

/** `tall` heightens the socket to match ItemBox's own gridWidth=2 sizing (weapon/armor) instead
 * of leaving a 2-cell item cramped into a 1-cell socket. */
export function EquipSlotBox({
  slot,
  tall = false,
  children,
}: {
  slot: EquipSlot;
  tall?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `equip-${slot}`,
    data: { type: "equip", equipSlot: slot },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={setNodeRef}
        className={`relative flex w-14 items-center justify-center border-2 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)] transition ${
          tall ? "h-[7.5rem]" : "h-14"
        } ${
          isOver
            ? "border-gold-bright bg-gold/30 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45),0_0_16px_oklch(76%_0.09_85_/_0.7)]"
            : "border-transparent"
        }`}
      >
        {children}
        <SocketCorners />
      </div>
      <span className="text-xs text-parchment-faint">{LABELS[slot]}</span>
    </div>
  );
}
