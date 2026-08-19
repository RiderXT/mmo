import { useQuery } from "@tanstack/react-query";
import { listInventory } from "../../lib/inventoryApi";
import { ActiveItemSlotBox } from "../inventory/ActiveItemSlotBox";
import { ItemBox } from "../inventory/ItemBox";

const ACTIVE_SLOTS = 6;

/** Read-only view of the character's active item slots (see EquipmentTab's "Aktywne itemy") —
 * shown in the expedition view so the player can check their potion loadout, exactly which
 * potions get auto-consumed during a fight, at a glance without switching to the Ekwipunek tab.
 * Reuses the exact same slot/item components as the equipment doll for visual consistency;
 * ItemBox's drag wiring (dnd-kit's useDraggable) is safe to render outside a DndContext — it
 * just never activates here, since nothing wraps this tree in one. */
export function ActivePotionsSummary({ characterId }: { characterId: string }) {
  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });
  if (!inventoryQuery.data) return null;

  const byActiveSlot = new Map<number, (typeof inventoryQuery.data)[number]>();
  for (const item of inventoryQuery.data) {
    if (item.activeSlotIndex !== null) byActiveSlot.set(item.activeSlotIndex, item);
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-xs font-medium text-parchment-dim">
        Aktywne mikstury (zużywane automatycznie na ekspedycji)
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: ACTIVE_SLOTS }, (_, slotIndex) => {
          const item = byActiveSlot.get(slotIndex);
          return (
            <ActiveItemSlotBox key={slotIndex} slotIndex={slotIndex}>
              {item && <ItemBox inventoryItem={item} alwaysShowQuantity />}
            </ActiveItemSlotBox>
          );
        })}
      </div>
    </div>
  );
}
