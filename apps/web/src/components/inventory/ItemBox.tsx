import { useDraggable } from "@dnd-kit/core";
import type { InventoryItemDto } from "../../lib/inventoryApi";

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
};

function statsSummary(stats: Record<string, number | undefined>): string {
  return Object.entries(stats)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

export function ItemBox({
  inventoryItem,
  onSelect,
  selected,
}: {
  inventoryItem: InventoryItemDto;
  onSelect: () => void;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: inventoryItem.id,
    data: { inventoryItem },
  });

  const stats = { ...inventoryItem.item.baseStats, ...inventoryItem.rolledStats };
  const title = `${inventoryItem.item.name}${inventoryItem.upgradeLevel ? ` +${inventoryItem.upgradeLevel}` : ""}\n${statsSummary(stats)}`;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      title={title}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined}
      className={`relative flex h-14 w-14 cursor-grab select-none flex-col items-center justify-center border text-[10px] font-medium text-parchment active:cursor-grabbing ${
        TYPE_COLORS[inventoryItem.item.type] ?? "border-line-soft bg-panel-raised"
      } ${selected ? "ring-2 ring-gold-bright" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="line-clamp-2 px-1 text-center leading-tight">{inventoryItem.item.name}</span>
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
  );
}
