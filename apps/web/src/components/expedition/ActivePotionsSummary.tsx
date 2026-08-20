import { useQuery } from "@tanstack/react-query";
import type { CombatEvent } from "@mmo/shared";
import type { ItemDto } from "../../lib/adminApi";
import { listInventory } from "../../lib/inventoryApi";
import { API_URL } from "../../lib/apiClient";
import { ActiveItemSlotBox } from "../inventory/ActiveItemSlotBox";
import { ItemBox } from "../inventory/ItemBox";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

const ACTIVE_SLOTS = 6;

/** Non-interactive stand-in for a snapshot slot — the item may already be fully consumed (gone
 * from live inventory), so this renders straight from the catalog (`itemFor`), not a real
 * `InventoryItemDto`. Same 56px footprint/icon grammar as ItemBox, just without drag/tooltip. */
function SnapshotItemBox({ item, quantity }: { item: ItemDto | undefined; quantity: number }) {
  return (
    <div
      title={item?.name}
      className="relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 border border-line-soft bg-panel-raised text-xs font-medium text-parchment-dim"
    >
      {item?.imageUrl ? (
        <img src={`${API_URL}${item.imageUrl}`} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />
      ) : (
        <ItemTypeIcon type={item?.type ?? "consumable"} className="h-6 w-6 text-parchment-dim" />
      )}
      <span className="absolute bottom-0.5 right-1 text-xs text-parchment-dim">{quantity}</span>
    </div>
  );
}

/** The combat sim only tags a `potion_used` event with the item's display name (not an id — see
 * combat.ts), so slots are matched back by name. Consumption is distributed across slots holding
 * the same-named item in slotIndex order (first slot depletes before the next starts) — a real
 * edge case only when a player splits one item across two active slots, which the UI doesn't
 * currently encourage. */
function applyRevealedConsumption(
  snapshot: { slotIndex: number; itemId: string; quantity: number }[],
  revealedEvents: CombatEvent[] | undefined,
  itemFor: ((itemId: string) => ItemDto | undefined) | undefined,
): Map<number, number> {
  const remaining = new Map(snapshot.map((s) => [s.slotIndex, s.quantity]));
  if (!revealedEvents || !itemFor) return remaining;

  const consumedByName = new Map<string, number>();
  for (const event of revealedEvents) {
    if (event.type !== "potion_used") continue;
    consumedByName.set(event.itemName, (consumedByName.get(event.itemName) ?? 0) + 1);
  }
  if (consumedByName.size === 0) return remaining;

  for (const entry of [...snapshot].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const name = itemFor(entry.itemId)?.name;
    if (!name) continue;
    const budget = consumedByName.get(name) ?? 0;
    if (budget <= 0) continue;
    const taken = Math.min(budget, remaining.get(entry.slotIndex) ?? 0);
    remaining.set(entry.slotIndex, (remaining.get(entry.slotIndex) ?? 0) - taken);
    consumedByName.set(name, budget - taken);
  }
  return remaining;
}

/** Read-only view of the character's active item slots (see EquipmentTab's "Aktywne itemy") —
 * shown in the expedition view so the player can check their potion loadout, exactly which
 * potions get auto-consumed during a fight, at a glance without switching to the Ekwipunek tab.
 * Reuses the exact same slot/item components as the equipment doll for visual consistency;
 * ItemBox's drag wiring (dnd-kit's useDraggable) is safe to render outside a DndContext — it
 * just never activates here, since nothing wraps this tree in one.
 *
 * `snapshot` (only passed for an in-progress expedition, see ExpeditionPanel) overrides the live
 * inventory query — the whole fight, including potion consumption, is resolved atomically at
 * start (see startExpedition), so a live query would already show the post-fight state — often
 * fully empty slots — for the entire time the "w toku" screen stays open. The snapshot is what
 * was actually equipped when this fight began; `revealedEvents` (same array ExpeditionPanel
 * already reveals into CombatLog/MonsterEncounterPanel as the fight's own clock ticks forward)
 * lets this component count `potion_used` events that have happened SO FAR and subtract them
 * live, instead of just showing the frozen start-of-fight count with a "may already be used"
 * disclaimer. */
export function ActivePotionsSummary({
  characterId,
  snapshot,
  itemFor,
  revealedEvents,
}: {
  characterId: string;
  snapshot?: { slotIndex: number; itemId: string; quantity: number }[];
  itemFor?: (itemId: string) => ItemDto | undefined;
  revealedEvents?: CombatEvent[];
}) {
  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
    enabled: !snapshot,
  });

  if (snapshot) {
    const bySlot = new Map(snapshot.map((s) => [s.slotIndex, s]));
    const remainingBySlot = applyRevealedConsumption(snapshot, revealedEvents, itemFor);
    return (
      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium text-parchment-dim">Aktywne mikstury (na bieżąco w trakcie walki)</p>
        <div className="flex flex-wrap justify-center gap-3">
          {Array.from({ length: ACTIVE_SLOTS }, (_, slotIndex) => {
            const entry = bySlot.get(slotIndex);
            const remaining = entry ? (remainingBySlot.get(slotIndex) ?? entry.quantity) : 0;
            return (
              <ActiveItemSlotBox key={slotIndex} slotIndex={slotIndex}>
                {entry && remaining > 0 && <SnapshotItemBox item={itemFor?.(entry.itemId)} quantity={remaining} />}
              </ActiveItemSlotBox>
            );
          })}
        </div>
      </div>
    );
  }

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
