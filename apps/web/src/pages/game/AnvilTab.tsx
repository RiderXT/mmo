import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, EquipSlot, ItemType } from "@mmo/shared";
import { defaultUpgradeSuccessChance, defaultUpgradeGoldCost } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { EquipSlotBox } from "../../components/inventory/EquipSlotBox";
import { AnvilSlotBox } from "../../components/inventory/AnvilSlotBox";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemTypeIcon } from "../../components/inventory/ItemTypeIcon";
import { interpolateUpgrade } from "../../lib/statMath";
import { STAT_LABELS, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";
import { ApiError } from "../../lib/apiClient";
import { listInventory, upgradeItem, type InventoryItemDto } from "../../lib/inventoryApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { listPlayerZones } from "../../lib/zonesApi";
import { layoutGridTab, INVENTORY_GRID_SLOTS_PER_TAB } from "../../lib/inventoryGrid";
import type { ItemDto } from "../../lib/adminApi";

const UPGRADABLE_TYPES = new Set<ItemType>([
  "weapon",
  "armor",
  "helmet",
  "boots",
  "shield",
  "necklace",
  "earrings",
  "ring",
]);
const LEFT_EQUIP_SLOTS: EquipSlot[] = ["helmet", "armor", "necklace", "boots"];
const RIGHT_EQUIP_SLOTS: EquipSlot[] = ["weapon", "shield", "ring", "earrings"];
const GRID_SLOTS = INVENTORY_GRID_SLOTS_PER_TAB;
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function AnvilTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });

  const itemFor = (itemId: string): ItemDto | undefined => itemsQuery.data?.find((i) => i.id === itemId);

  const ownedQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventoryQuery.data ?? []) {
      map.set(inv.itemId, (map.get(inv.itemId) ?? 0) + inv.quantity);
    }
    return map;
  }, [inventoryQuery.data]);

  const upgradeMutation = useMutation({
    mutationFn: (inventoryItemId: string) => upgradeItem(characterId, inventoryItemId),
    onSuccess: (result) => {
      setError(null);
      setResultMessage(
        result.success
          ? `Sukces! Przedmiot ulepszony do +${result.newLevel}.`
          : "Porażka — przedmiot został zniszczony, a złoto i materiały przepadły.",
      );
      queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
      queryClient.invalidateQueries({ queryKey: ["combat-stats", characterId] });
      queryClient.invalidateQueries({ queryKey: ["combat-stats-breakdown", characterId] });
    },
    onError: (err) => {
      setResultMessage(null);
      setError(err instanceof ApiError ? err.message : "Nie udało się ulepszyć przedmiotu");
    },
  });

  function selectItem(id: string) {
    setSelectedId(id);
    setResultMessage(null);
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || over.data.current?.type !== "anvil") return;
    const inventoryItem = active.data.current?.inventoryItem as InventoryItemDto | undefined;
    if (!inventoryItem) return;
    selectItem(inventoryItem.id);
  }

  const currentZone = zonesQuery.data?.find((z) => z.id === character.currentZoneId);
  const inTown = currentZone?.isTown ?? false;

  if (zonesQuery.data && !inTown) {
    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">Kowadło</h2>
        <p className="mt-2 text-sm text-parchment-faint">Kowadło jest dostępne tylko w mieście.</p>
      </div>
    );
  }

  const items = inventoryQuery.data ?? [];
  const byEquipSlot = new Map<EquipSlot, InventoryItemDto>();
  const byGridSlot = new Map<number, InventoryItemDto>();
  for (const item of items) {
    // The selected item is shown "on the anvil" instead of its normal spot — otherwise the same
    // inventoryItemId would render as two separate dnd-kit draggables at once.
    if (item.id === selectedId) continue;
    if (item.equippedSlot) byEquipSlot.set(item.equippedSlot, item);
    else if (item.activeSlotIndex === null && UPGRADABLE_TYPES.has(item.item.type)) byGridSlot.set(item.slotIndex!, item);
  }
  const tabItemCounts = Array.from({ length: INVENTORY_TABS }, (_, tab) => {
    let count = 0;
    for (const slotIndex of byGridSlot.keys()) {
      if (Math.floor(slotIndex / GRID_SLOTS) === tab) count += 1;
    }
    return count;
  });

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const selectedCatalogItem = selected ? itemFor(selected.itemId) : undefined;
  const targetLevel = selected ? selected.upgradeLevel + 1 : null;
  const levelConfig = selectedCatalogItem?.upgradeLevelConfigs.find((c) => c.targetLevel === targetLevel);
  const chance = targetLevel !== null ? (levelConfig?.successChance ?? defaultUpgradeSuccessChance(targetLevel)) : null;
  const goldCost = targetLevel !== null ? (levelConfig?.goldCost ?? defaultUpgradeGoldCost(targetLevel)) : null;
  const hasEnoughGold = goldCost !== null && character.gold >= goldCost;
  const requirements = selectedCatalogItem?.upgradeRequirements.filter((r) => r.targetLevel === targetLevel) ?? [];
  const hasPath = requirements.length > 0;
  const hasAllMaterials = requirements.every((r) => (ownedQtyByItemId.get(r.requiredItemId) ?? 0) >= r.requiredQty);

  const currentStats = selected
    ? { ...interpolateUpgrade(selected.item.baseStats, selected.item.maxUpgradeStats, selected.upgradeLevel), ...selected.rolledStats }
    : {};
  const afterStats = selected
    ? { ...interpolateUpgrade(selected.item.baseStats, selected.item.maxUpgradeStats, selected.upgradeLevel + 1), ...selected.rolledStats }
    : {};
  const statKeys = Array.from(new Set([...Object.keys(currentStats), ...Object.keys(afterStats)])).filter(
    (k) => currentStats[k as keyof typeof currentStats] || afterStats[k as keyof typeof afterStats],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr_1.1fr]">
        {/* Założony ekwipunek — osobna ramka, całkowicie z lewej strony. */}
        <div className="panel p-4">
          <h2 className="font-medium text-parchment">Założony ekwipunek</h2>
          <div className="mt-3 flex justify-center gap-4">
            <div className="flex flex-col items-center gap-3">
              {LEFT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item && (
                      <ItemBox inventoryItem={item} selected={item.id === selectedId} onSelect={() => selectItem(item.id)} />
                    )}
                  </EquipSlotBox>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-3">
              {RIGHT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item && (
                      <ItemBox inventoryItem={item} selected={item.id === selectedId} onSelect={() => selectItem(item.id)} />
                    )}
                  </EquipSlotBox>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ekwipunek do wyboru — siatka materiałów/przedmiotów do ulepszenia. */}
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-parchment-dim">Ekwipunek (przeciągnij na kowadło albo kliknij)</p>
            <div className="flex gap-1">
              {Array.from({ length: INVENTORY_TABS }, (_, tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
                    activeTab === tab ? "bg-gold text-ink" : "bg-panel-raised text-parchment-dim hover:bg-line-soft"
                  } ${tabItemCounts[tab] > 0 ? "" : "opacity-60"}`}
                  title={`Zakładka ${tab + 1} (${tabItemCounts[tab]} przedmiotów)`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {layoutGridTab(byGridSlot, activeTab * GRID_SLOTS).map((cell) => (
              <GridSlot key={cell.slotIndex} slotIndex={cell.slotIndex} height={cell.height}>
                {cell.item && (
                  <ItemBox
                    inventoryItem={cell.item}
                    tall={cell.height === 2}
                    selected={cell.item.id === selectedId}
                    onSelect={() => selectItem(cell.item!.id)}
                  />
                )}
              </GridSlot>
            ))}
          </div>
        </div>

        {/* Kowadło — miejsce, w którym ląduje wybrany przedmiot, plus szczegóły ulepszenia. */}
        <div className="panel p-4">
          <h2 className="font-medium text-parchment">Kowadło</h2>
          <p className="mt-1 text-xs text-parchment-faint">
            Przeciągnij przedmiot (z ekwipunku lub założony) tutaj, żeby go wybrać, albo kliknij.
          </p>
          <div className="mt-3 flex justify-center">
            <AnvilSlotBox>
              {selected && <ItemBox inventoryItem={selected} selected onSelect={() => selectItem(selected.id)} />}
            </AnvilSlotBox>
          </div>

          {!selected ? (
            <p className="mt-4 text-sm text-parchment-faint">Wybierz przedmiot z ekwipunku, żeby zobaczyć szczegóły.</p>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold/60 bg-gradient-to-br from-panel-raised to-panel shadow-[0_0_14px_oklch(76%_0.09_85_/_0.25)]">
                  <ItemTypeIcon type={selected.item.type} className="h-9 w-9 text-gold-bright" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold uppercase tracking-wide text-parchment">
                    {selected.item.name}
                    {selected.upgradeLevel > 0 && <span className="text-gold-bright"> +{selected.upgradeLevel}</span>}
                  </h2>
                  <p className="mt-1 text-xs text-parchment-faint">
                    {TYPE_LABELS[selected.item.type] ?? selected.item.type} · od poziomu {selected.item.minLevel}
                    {selected.item.class ? ` · dla klasy: ${selected.item.class.name}` : " · uniwersalny"}
                    {selected.equippedSlot ? ` · założony (${selected.equippedSlot})` : ""}
                  </p>
                </div>
              </div>
              {selected.item.description && <p className="mt-3 text-sm text-parchment-dim">{selected.item.description}</p>}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[300px] text-left text-sm">
                  <thead className="text-parchment-dim">
                    <tr>
                      <th className="py-1 pr-3">Staty</th>
                      <th className="px-2 py-1 text-right">Teraz (+{selected.upgradeLevel})</th>
                      <th className="py-1 pl-2 text-right">Po ulepszeniu (+{targetLevel})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {statKeys.map((k) => {
                      const statKey = k as keyof typeof STAT_LABELS;
                      const before = currentStats[statKey as keyof typeof currentStats] as number | undefined;
                      const after = afterStats[statKey as keyof typeof afterStats] as number | undefined;
                      const changed = (before ?? 0) !== (after ?? 0);
                      return (
                        <tr key={k}>
                          <td className="py-1 pr-3 text-parchment-dim">{STAT_LABELS[statKey] ?? k}</td>
                          <td className="px-2 py-1 text-right text-parchment-dim">
                            {formatStatValue(statKey, before ?? 0)}
                          </td>
                          <td className={`py-1 pl-2 text-right font-medium ${changed ? "text-gold-bright" : "text-parchment"}`}>
                            {formatStatValue(statKey, after ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!hasPath ? (
                <p className="mt-3 text-sm text-parchment-faint">
                  Brak zdefiniowanej ścieżki ulepszenia dla tego poziomu.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm text-parchment-dim">
                    Koszt w złocie:{" "}
                    <span className={`font-medium ${hasEnoughGold ? "text-gold-bright" : "text-red-400"}`}>
                      {goldCost}g
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-parchment-dim">
                    Szansa powodzenia: <span className="font-medium text-gold-bright">{Math.round((chance ?? 0) * 100)}%</span>
                  </p>
                  <p className="mt-1 text-xs text-parchment-faint">
                    Przy porażce przedmiot zostaje zniszczony, a złoto i materiały przepadają.
                  </p>

                  <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-parchment-faint">
                    Wymagane materiały
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {requirements.map((r) => {
                      const owned = ownedQtyByItemId.get(r.requiredItemId) ?? 0;
                      const ok = owned >= r.requiredQty;
                      const materialType = itemFor(r.requiredItemId)?.type ?? "material";
                      return (
                        <li
                          key={r.requiredItemId}
                          className={`flex items-center gap-2 border px-2 py-1.5 ${
                            ok ? "border-line-soft bg-panel-raised" : "border-red-500/50 bg-red-500/10"
                          }`}
                        >
                          <ItemTypeIcon
                            type={materialType}
                            className={`h-5 w-5 shrink-0 ${ok ? "text-parchment-dim" : "text-red-400"}`}
                          />
                          <span className={ok ? "text-parchment-dim" : "text-red-400"}>{r.requiredItem.name}</span>
                          <span className={`ml-auto font-medium tabular-nums ${ok ? "text-parchment" : "text-red-400"}`}>
                            {owned} / {r.requiredQty}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={() => upgradeMutation.mutate(selected.id)}
                    disabled={upgradeMutation.isPending || !hasAllMaterials || !hasEnoughGold}
                    className="mt-4 w-full rounded-md bg-gold px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ulepsz przedmiot
                  </button>
                </>
              )}
            </>
          )}

          {resultMessage && <p className="mt-3 text-sm text-rarity-uncommon">{resultMessage}</p>}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </DndContext>
  );
}
