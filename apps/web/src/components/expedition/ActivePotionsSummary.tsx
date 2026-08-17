import { useQuery } from "@tanstack/react-query";
import { listInventory } from "../../lib/inventoryApi";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

/** Compact read-only summary of which consumables currently sit in the character's active item
 * slots (see EquipmentTab's "Aktywne itemy") — shown in the expedition view so the player can
 * check their potion loadout at a glance, since these are exactly what gets auto-consumed during
 * a fight, without switching to the Ekwipunek tab. */
export function ActivePotionsSummary({ characterId }: { characterId: string }) {
  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });
  if (!inventoryQuery.data) return null;

  const active = inventoryQuery.data
    .filter((i) => i.activeSlotIndex !== null)
    .sort((a, b) => (a.activeSlotIndex ?? 0) - (b.activeSlotIndex ?? 0));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span className="text-xs font-medium text-parchment-dim">Aktywne mikstury:</span>
      {active.length === 0 ? (
        <span className="text-xs text-parchment-faint">brak założonych</span>
      ) : (
        active.map((item) => (
          <span
            key={item.id}
            title={item.item.name}
            className="flex items-center gap-1 rounded-md border border-line-soft bg-panel-raised px-2 py-1 text-xs text-parchment-dim"
          >
            <ItemTypeIcon type={item.item.type} className="h-3.5 w-3.5 shrink-0" />
            {item.item.name}
            {item.quantity > 1 ? ` ×${item.quantity}` : ""}
          </span>
        ))
      )}
    </div>
  );
}
