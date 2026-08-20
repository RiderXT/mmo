import type { ItemType } from "@mmo/shared";
import type { NpcShopItemPublicDto } from "../../lib/npcShopApi";
import type { ItemDto } from "../../lib/adminApi";
import { interpolateUpgrade } from "../../lib/statMath";
import { API_URL } from "../../lib/apiClient";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { ItemTooltip } from "./ItemTooltip";

/** One merchant shop entry, styled to match the player's own ItemBox (56px square, uploaded
 * artwork or type icon, hover tooltip with stats/class warning) instead of the old large padded
 * card — "Twój ekwipunek" and "Handel" now read as the same visual grammar. `stock` doubles as
 * the stack-quantity badge (admin sets it in NpcsAdminPage's numeric "stock" field) — e.g.
 * stock=200 shows "200" exactly like a 200-stack in a real inventory slot, shrinking as players
 * buy; null (unlimited) shows no badge, matching an unstacked/limitless good. */
export function ShopItemBox({
  entry,
  fullItem,
  restrictedToClassName,
  classMismatch,
  onSelect,
}: {
  entry: NpcShopItemPublicDto;
  fullItem: ItemDto | undefined;
  /** Class restriction display name, or null when usable by any class / unknown. */
  restrictedToClassName: string | null;
  classMismatch: boolean;
  onSelect: () => void;
}) {
  const outOfStock = entry.stock !== null && entry.stock <= 0;
  const stats = fullItem ? interpolateUpgrade(fullItem.baseStats, fullItem.maxUpgradeStats, 0) : {};

  return (
    <ItemTooltip
      name={entry.item.name}
      upgradeLevel={0}
      type={entry.item.type}
      minLevel={fullItem?.minLevel ?? 1}
      className={restrictedToClassName}
      stats={stats}
      classMismatch={classMismatch}
    >
      <button
        onClick={onSelect}
        disabled={outOfStock}
        className={`relative flex h-14 w-14 shrink-0 flex-col items-center justify-center border text-xs font-medium text-parchment transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
          classMismatch ? "border-red-500/40 bg-red-500/5" : "border-line-soft bg-panel-raised"
        }`}
      >
        {fullItem?.imageUrl ? (
          <img src={`${API_URL}${fullItem.imageUrl}`} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />
        ) : (
          <ItemTypeIcon type={entry.item.type as ItemType} className="h-6 w-6 text-parchment-dim" />
        )}
        {entry.stock !== null && (
          <span className="absolute bottom-0.5 right-1 rounded-sm bg-ink/70 px-0.5 text-xs text-parchment">
            {entry.stock}
          </span>
        )}
        <span className="absolute left-0.5 top-0.5 rounded-sm bg-ink/70 px-0.5 text-[9px] font-bold text-gold-bright">
          {entry.goldPrice}
        </span>
      </button>
    </ItemTooltip>
  );
}
