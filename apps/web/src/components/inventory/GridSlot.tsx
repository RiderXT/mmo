import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SocketCorners } from "./SocketCorners";

/** `height` is the number of grid rows this cell spans (2 for the primary slot of a gridWidth=2
 * item — see apps/web/src/lib/inventoryGrid.ts; despite the DB field's name, items now stack
 * vertically, not horizontally). The droppable id/data still only ever reference the single
 * primary slotIndex; the extra row is purely visual. */
export function GridSlot({
  slotIndex,
  height = 1,
  children,
}: {
  slotIndex: number;
  height?: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `grid-${slotIndex}`,
    data: { type: "grid", slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex w-14 items-center justify-center border border-dashed shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)] transition ${
        height >= 2 ? "row-span-2 h-[7.5rem]" : "h-14"
      } ${
        isOver
          ? "border-gold-bright bg-gold/10 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45),0_0_8px_oklch(76%_0.09_85_/_0.35)]"
          : "border-line"
      }`}
    >
      {children}
      <SocketCorners />
    </div>
  );
}
