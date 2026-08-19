import { useDroppable } from "@dnd-kit/core";
import type { InventoryItemDto } from "../../lib/inventoryApi";
import type { ItemDto } from "../../lib/adminApi";
import { API_URL } from "../../lib/apiClient";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { ItemBox } from "./ItemBox";

/** One auto-filled, non-interactive square in the anvil's "Wymagane materiały" grid — shows the
 * material's own artwork (or the generic type icon as fallback), and an owned/required badge
 * that turns the whole square red when there isn't enough of it in inventory yet. Unlike
 * CatalystSlotBox below, this isn't a drop target — required materials are entirely determined
 * by the item's upgrade path, not something the player chooses. */
export function MaterialSlotBox({ item, owned, required }: { item: ItemDto | undefined; owned: number; required: number }) {
  const ok = owned >= required;
  return (
    <div
      title={item?.name ?? ""}
      className={`relative flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border text-xs font-medium transition ${
        ok ? "border-line-soft bg-panel-raised" : "border-red-500/60 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.35)]"
      }`}
    >
      {item?.imageUrl ? (
        <img src={`${API_URL}${item.imageUrl}`} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />
      ) : (
        <>
          <ItemTypeIcon type={item?.type ?? "material"} className={`h-6 w-6 ${ok ? "text-parchment-dim" : "text-red-400"}`} />
          <span className={`line-clamp-1 px-1 text-center leading-tight ${ok ? "text-parchment-dim" : "text-red-400"}`}>
            {item?.name}
          </span>
        </>
      )}
      <span
        className={`absolute bottom-0.5 right-1 rounded-sm bg-ink/70 px-0.5 text-[10px] font-bold tabular-nums ${
          ok ? "text-parchment" : "text-red-400"
        }`}
      >
        {owned}/{required}
      </span>
    </div>
  );
}

/** One optional catalyst square — whatever's left in the 4-slot grid after the auto-filled
 * material squares above. A drop target (and click-to-remove once filled) for "catalyst"-type
 * items the player chooses to add for their upgrade-chance bonus; entirely the player's call,
 * unlike the required materials. */
export function CatalystSlotBox({
  index,
  inventoryItem,
  onRemove,
}: {
  index: number;
  inventoryItem: InventoryItemDto | null;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `catalyst-slot-${index}`,
    data: { type: "catalyst-slot", index },
  });

  if (inventoryItem) {
    // ItemBox already renders a full 56px bordered box — this wrapper only adds the droppable
    // ref and a click-to-remove, no styling of its own, so the box doesn't nest inside a box.
    return (
      <div ref={setNodeRef} title="Kliknij, by usunąć" onClick={onRemove} className="cursor-pointer">
        <ItemBox inventoryItem={inventoryItem} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      title="Przeciągnij tu ulepszacz (opcjonalnie)"
      className={`flex h-14 w-14 shrink-0 items-center justify-center border border-dashed text-center transition ${
        isOver ? "border-gold-bright bg-gold/20" : "border-line-soft bg-panel-raised/40"
      }`}
    >
      <span className="px-1 text-[9px] uppercase tracking-wide text-parchment-faint">Ulepszacz</span>
    </div>
  );
}
