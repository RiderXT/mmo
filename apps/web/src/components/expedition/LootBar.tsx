import type { CombatEvent } from "@mmo/shared";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";
import type { LootItemLookup } from "./CombatLog";

/** Aggregates every "loot" event revealed so far into itemId -> total quantity, replacing the
 * old text-log line-per-drop with a single running strip of icons (fewer drops read faster,
 * and it matches the icon-based inventory grid instead of a wall of item names). */
function aggregateLoot(events: CombatEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.type === "loot") map.set(e.itemId, (map.get(e.itemId) ?? 0) + e.quantity);
  }
  return map;
}

export function LootBar({
  events,
  itemFor,
}: {
  events: CombatEvent[];
  itemFor: (id: string) => LootItemLookup | undefined;
}) {
  const loot = aggregateLoot(events);
  if (loot.size === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border border-line bg-ink/60 p-2">
      <span className="text-xs text-parchment-faint">Zdobyto:</span>
      {Array.from(loot.entries()).map(([itemId, quantity]) => {
        const item = itemFor(itemId);
        return (
          <div
            key={itemId}
            title={item?.name ?? itemId}
            className="relative flex h-9 w-9 items-center justify-center border border-line-soft bg-panel-raised"
          >
            <ItemTypeIcon type={item?.type ?? "material"} className="h-5 w-5 text-parchment-dim" />
            <span className="absolute bottom-0 right-0.5 text-[9px] text-gold-bright">×{quantity}</span>
          </div>
        );
      })}
    </div>
  );
}
