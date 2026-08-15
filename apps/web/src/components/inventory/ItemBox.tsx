import { useDraggable } from "@dnd-kit/core";
import type { InventoryItemDto } from "../../lib/inventoryApi";
import { interpolateUpgrade } from "../../lib/statMath";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { ItemTooltip } from "./ItemTooltip";

const TYPE_COLORS: Record<string, string> = {
  weapon: "border-hp/60 bg-hp/10",
  armor: "border-rarity-rare/50 bg-rarity-rare/10",
  helmet: "border-rarity-rare/50 bg-rarity-rare/10",
  boots: "border-rarity-rare/50 bg-rarity-rare/10",
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
  selected,
  onContextMenu,
}: {
  inventoryItem: InventoryItemDto;
  onSelect: () => void;
  selected: boolean;
  onContextMenu?: (inventoryItem: InventoryItemDto, x: number, y: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: inventoryItem.id,
    data: { inventoryItem },
  });

  const stats = {
    ...interpolateUpgrade(inventoryItem.item.baseStats, inventoryItem.item.maxUpgradeStats, inventoryItem.upgradeLevel),
    ...inventoryItem.rolledStats,
  };

  return (
    <ItemTooltip
      name={inventoryItem.item.name}
      upgradeLevel={inventoryItem.upgradeLevel}
      type={inventoryItem.item.type}
      minLevel={inventoryItem.item.minLevel}
      className={inventoryItem.item.class?.name ?? null}
      stats={stats}
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
        style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined}
        className={`relative flex h-14 w-14 cursor-grab select-none flex-col items-center justify-center gap-0.5 border text-[10px] font-medium text-parchment active:cursor-grabbing ${
          TYPE_COLORS[inventoryItem.item.type] ?? "border-line-soft bg-panel-raised"
        } ${selected ? "ring-2 ring-gold-bright" : ""} ${isDragging ? "opacity-40" : ""}`}
      >
        <ItemTypeIcon type={inventoryItem.item.type} className="h-6 w-6 text-parchment-dim" />
        <span className="line-clamp-1 px-1 text-center leading-tight">{inventoryItem.item.name}</span>
        {inventoryItem.upgradeLevel > 0 && (
          <span className="absolute left-0.5 top-0.5 text-[9px] text-gold-bright">
            +{inventoryItem.upgradeLevel}
          </span>
        )}
        {inventoryItem.quantity > 1 && (
          <span className="absolute bottom-0.5 right-1 text-[10px] text-parchment-dim">
            {inventoryItem.quantity}
          </span>
        )}
      </div>
    </ItemTooltip>
  );
}
