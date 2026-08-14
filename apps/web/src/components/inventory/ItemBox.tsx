import { useDraggable } from "@dnd-kit/core";
import type { InventoryItemDto } from "../../lib/inventoryApi";

const TYPE_COLORS: Record<string, string> = {
  weapon: "border-red-500/50 bg-red-950/40",
  helmet: "border-sky-500/50 bg-sky-950/40",
  armor: "border-sky-500/50 bg-sky-950/40",
  gloves: "border-sky-500/50 bg-sky-950/40",
  boots: "border-sky-500/50 bg-sky-950/40",
  accessory: "border-amber-500/50 bg-amber-950/40",
  consumable: "border-emerald-500/50 bg-emerald-950/40",
  material: "border-slate-500/50 bg-slate-800/60",
  quest: "border-purple-500/50 bg-purple-950/40",
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
      className={`relative flex h-14 w-14 cursor-grab select-none flex-col items-center justify-center rounded-lg border text-[10px] font-medium text-slate-100 active:cursor-grabbing ${
        TYPE_COLORS[inventoryItem.item.type] ?? "border-slate-700 bg-slate-800"
      } ${selected ? "ring-2 ring-indigo-400" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="line-clamp-2 px-1 text-center leading-tight">{inventoryItem.item.name}</span>
      {inventoryItem.upgradeLevel > 0 && (
        <span className="absolute left-0.5 top-0.5 text-[9px] text-amber-300">
          +{inventoryItem.upgradeLevel}
        </span>
      )}
      {inventoryItem.quantity > 1 && (
        <span className="absolute bottom-0.5 right-1 text-[10px] text-slate-300">
          {inventoryItem.quantity}
        </span>
      )}
    </div>
  );
}
