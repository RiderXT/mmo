import { useDraggable } from "@dnd-kit/core";
import type { InventoryItemDto } from "../../lib/inventoryApi";
import { interpolateUpgrade } from "../../lib/statMath";
import { API_URL } from "../../lib/apiClient";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { ItemTooltip } from "./ItemTooltip";

/** Uploaded artwork when the admin has set one, otherwise the generic per-type placeholder. */
function ItemIcon({ type, imageUrl, className }: { type: InventoryItemDto["item"]["type"]; imageUrl: string | null; className?: string }) {
  if (imageUrl) return <img src={`${API_URL}${imageUrl}`} alt="" className={`${className} object-contain`} />;
  return <ItemTypeIcon type={type} className={className} />;
}

const TYPE_COLORS: Record<string, string> = {
  weapon: "border-rarity-rare/50 bg-rarity-rare/10",
  armor: "border-rarity-rare/50 bg-rarity-rare/10",
  helmet: "border-rarity-rare/50 bg-rarity-rare/10",
  boots: "border-rarity-rare/50 bg-rarity-rare/10",
  shield: "border-rarity-rare/50 bg-rarity-rare/10",
  necklace: "border-gold/50 bg-gold/10",
  earrings: "border-gold/50 bg-gold/10",
  ring: "border-gold/50 bg-gold/10",
  consumable: "border-rarity-uncommon/50 bg-rarity-uncommon/10",
  material: "border-rarity-common/50 bg-rarity-common/10",
  quest: "border-rarity-epic/50 bg-rarity-epic/10",
  chest: "border-gold-bright/50 bg-gold-bright/10",
};

export function ItemBox({
  inventoryItem,
  onSelect,
  selected = false,
  onContextMenu,
  tall = false,
  equippedComparisonItem,
  characterClassId,
  alwaysShowQuantity = false,
  gatherSuccessRequired,
}: {
  inventoryItem: InventoryItemDto;
  onSelect?: () => void;
  selected?: boolean;
  onContextMenu?: (inventoryItem: InventoryItemDto, x: number, y: number) => void;
  /** True when rendered as the primary cell of a gridWidth=2 item (weapon/armor) — heightens the
   * box to match GridSlot's own row-span-2 sizing instead of leaving it a narrow 1-cell box
   * inside a 2-cell socket. */
  tall?: boolean;
  /** The item currently worn in the equip slot this item would occupy, for the tooltip's stat
   * comparison — undefined disables the comparison (non-equippable type, or the caller doesn't
   * track equipped gear here), null means the slot is empty (compare against zero). */
  equippedComparisonItem?: InventoryItemDto | null;
  /** Viewing character's class id, for the tooltip's "wrong class" warning. */
  characterClassId?: string | null;
  /** Show the quantity badge even at quantity 1 — the active-potion bar wants the remaining
   * count visible from the start so it's obviously decreasing as an expedition auto-drinks it,
   * instead of the badge only appearing once you're down to a single potion. */
  alwaysShowQuantity?: boolean;
  /** gathering.settings.successesPerToolUpgrade — when provided AND the item is a rod/pickaxe,
   * the tooltip shows "Udane zbiórki: X/required". */
  gatherSuccessRequired?: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: inventoryItem.id,
    data: { inventoryItem },
  });

  const stats = {
    ...interpolateUpgrade(inventoryItem.item.baseStats, inventoryItem.item.maxUpgradeStats, inventoryItem.upgradeLevel),
    ...inventoryItem.rolledStats,
  };
  const compareStats =
    equippedComparisonItem === undefined
      ? undefined
      : equippedComparisonItem === null
        ? {}
        : {
            ...interpolateUpgrade(
              equippedComparisonItem.item.baseStats,
              equippedComparisonItem.item.maxUpgradeStats,
              equippedComparisonItem.upgradeLevel,
            ),
            ...equippedComparisonItem.rolledStats,
          };
  const classMismatch =
    !!inventoryItem.item.classId && characterClassId !== undefined && inventoryItem.item.classId !== characterClassId;
  const isGatherTool = inventoryItem.item.type === "rod" || inventoryItem.item.type === "pickaxe";

  return (
    <ItemTooltip
      name={inventoryItem.item.name}
      upgradeLevel={inventoryItem.upgradeLevel}
      type={inventoryItem.item.type}
      minLevel={inventoryItem.item.minLevel}
      className={inventoryItem.item.class?.name ?? null}
      stats={stats}
      compareStats={compareStats}
      classMismatch={classMismatch}
      gatherSuccessCount={isGatherTool && gatherSuccessRequired !== undefined ? inventoryItem.gatherSuccessCount : undefined}
      gatherSuccessRequired={isGatherTool ? gatherSuccessRequired : undefined}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onSelect}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(inventoryItem, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          // dnd-kit's {...attributes} already makes this div role="button" tabIndex={0}, but only
          // wires pointer activators (no KeyboardSensor is registered) — so Enter/Space need their
          // own handler to actually open the detail panel for keyboard users.
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`relative flex w-14 cursor-grab select-none flex-col items-center justify-center gap-0.5 border text-xs font-medium text-parchment transition active:cursor-grabbing hover:brightness-110 ${
          tall ? "h-[7.5rem]" : "h-14"
        } ${TYPE_COLORS[inventoryItem.item.type] ?? "border-line-soft bg-panel-raised"} ${
          selected
            ? "ring-2 ring-gold-bright ring-offset-2 ring-offset-ink shadow-[0_0_10px_oklch(76%_0.09_85_/_0.5)]"
            : ""
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <ItemIcon type={inventoryItem.item.type} imageUrl={inventoryItem.item.imageUrl} className="h-6 w-6 text-parchment-dim" />
        <span className="line-clamp-1 px-1 text-center leading-tight">{inventoryItem.item.name}</span>
        {inventoryItem.upgradeLevel > 0 && (
          <span className="absolute left-0.5 top-0.5 text-xs text-gold-bright">
            +{inventoryItem.upgradeLevel}
          </span>
        )}
        {(alwaysShowQuantity || inventoryItem.quantity > 1) && (
          <span className="absolute bottom-0.5 right-1 text-xs text-parchment-dim">
            {inventoryItem.quantity}
          </span>
        )}
      </div>
    </ItemTooltip>
  );
}

/** Non-interactive visual clone of ItemBox's tile — no useDraggable, no tooltip. Rendered inside
 * <DragOverlay> so the "ghost" of a dragged item survives DOM changes to the REAL ItemBox mid-drag
 * (e.g. switching inventory tabs unmounts the source slot's ItemBox, which would otherwise
 * silently end the drag — see EquipmentTab.tsx's onDragStart/onDragEnd + TabDropButton). */
export function ItemBoxPreview({ inventoryItem }: { inventoryItem: InventoryItemDto }) {
  return (
    <div
      className={`relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 border text-xs font-medium text-parchment shadow-xl ${
        TYPE_COLORS[inventoryItem.item.type] ?? "border-line-soft bg-panel-raised"
      }`}
    >
      <ItemIcon type={inventoryItem.item.type} imageUrl={inventoryItem.item.imageUrl} className="h-6 w-6 text-parchment-dim" />
      <span className="line-clamp-1 px-1 text-center leading-tight">{inventoryItem.item.name}</span>
    </div>
  );
}
