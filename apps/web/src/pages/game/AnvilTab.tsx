import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, EquipSlot, ItemType } from "@mmo/shared";
import { defaultUpgradeSuccessChance, defaultUpgradeGoldCost, ANVIL_SLOT_COUNT } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { EquipSlotBox } from "../../components/inventory/EquipSlotBox";
import { AnvilSlotBox } from "../../components/inventory/AnvilSlotBox";
import { MaterialSlotBox, CatalystSlotBox } from "../../components/inventory/AnvilRequirementSlots";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemTypeIcon } from "../../components/inventory/ItemTypeIcon";
import { TabDropButton } from "../../components/inventory/TabDropButton";
import { PanelFrame } from "../../components/common/PanelFrame";
import { interpolateUpgrade } from "../../lib/statMath";
import { STAT_LABELS, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";
import { ApiError } from "../../lib/apiClient";
import { listInventory, upgradeItem, type InventoryItemDto } from "../../lib/inventoryApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { listPlayerZones } from "../../lib/zonesApi";
import { getGatheringSettings } from "../../lib/gatheringApi";
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
  "rod",
  "pickaxe",
]);
/** Non-interactive stand-in for an equipped item's doll slot while that exact item sits on the
 * anvil — the anvil already owns the one real (draggable) ItemBox for it, so this renders the
 * same visual footprint without a second dnd-kit draggable of the same id. */
function AnvilEchoBox({ item }: { item: InventoryItemDto }) {
  return (
    <div
      title="Na kowadle"
      className="relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 border border-gold/40 bg-panel-raised/60 text-xs font-medium text-parchment-dim"
    >
      <ItemTypeIcon type={item.item.type} className="h-6 w-6 text-gold/60" />
      <span className="line-clamp-1 px-1 text-center leading-tight">{item.item.name}</span>
      {item.upgradeLevel > 0 && (
        <span className="absolute left-0.5 top-0.5 text-xs text-gold-bright">+{item.upgradeLevel}</span>
      )}
    </div>
  );
}

const LEFT_EQUIP_SLOTS: EquipSlot[] = ["helmet", "armor", "necklace", "boots"];
const RIGHT_EQUIP_SLOTS: EquipSlot[] = ["weapon", "shield", "ring", "earrings"];
const TOOL_EQUIP_SLOTS: EquipSlot[] = ["rod", "pickaxe"];
const GRID_SLOTS = INVENTORY_GRID_SLOTS_PER_TAB;
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function AnvilTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // One entry per free anvil slot (see catalystSlotCount below) — null = empty. Reset whenever
  // the item being upgraded changes, and after any attempt (win or lose consumes them, same as
  // materials/gold — see upgradeItem on the server).
  const [selectedCatalystIds, setSelectedCatalystIds] = useState<(string | null)[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    setSelectedCatalystIds([]);
  }, [selectedId]);

  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });
  const gatheringSettingsQuery = useQuery({ queryKey: ["gathering-settings"], queryFn: getGatheringSettings });

  const itemFor = (itemId: string): ItemDto | undefined => itemsQuery.data?.find((i) => i.id === itemId);

  const ownedQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventoryQuery.data ?? []) {
      map.set(inv.itemId, (map.get(inv.itemId) ?? 0) + inv.quantity);
    }
    return map;
  }, [inventoryQuery.data]);

  const upgradeMutation = useMutation({
    mutationFn: ({ inventoryItemId, catalystIds }: { inventoryItemId: string; catalystIds: string[] }) =>
      upgradeItem(characterId, inventoryItemId, catalystIds),
    onSuccess: (result) => {
      setError(null);
      setSelectedCatalystIds([]);
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

  function setCatalystAt(index: number, inventoryItemId: string) {
    setSelectedCatalystIds((prev) => {
      const next = [...prev];
      // Moving an already-placed catalyst to a different slot, not duplicating it.
      for (let i = 0; i < next.length; i++) if (next[i] === inventoryItemId) next[i] = null;
      while (next.length <= index) next.push(null);
      next[index] = inventoryItemId;
      return next;
    });
  }

  function removeCatalystAt(index: number) {
    setSelectedCatalystIds((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const inventoryItem = active.data.current?.inventoryItem as InventoryItemDto | undefined;
    if (!inventoryItem) return;
    const overData = over.data.current as { type?: string; index?: number } | undefined;
    if (overData?.type === "anvil") {
      if (!UPGRADABLE_TYPES.has(inventoryItem.item.type)) return;
      selectItem(inventoryItem.id);
    } else if (overData?.type === "catalyst-slot" && overData.index !== undefined) {
      if (inventoryItem.item.type !== "catalyst") return;
      setCatalystAt(overData.index, inventoryItem.id);
    }
  }

  /** Clicking a catalyst in the picker grid drops it in the first free catalyst slot instead of
   * selecting it as an upgrade target (only drag does that, via handleDragEnd's "anvil" branch —
   * catalysts don't have an upgrade path of their own). */
  function handlePickerSelect(item: InventoryItemDto, catalystSlotCount: number) {
    if (item.item.type === "catalyst") {
      const emptyIndex = Array.from({ length: catalystSlotCount }, (_, i) => i).find(
        (i) => (selectedCatalystIds[i] ?? null) === null,
      );
      if (emptyIndex !== undefined) setCatalystAt(emptyIndex, item.id);
      return;
    }
    selectItem(item.id);
  }

  const currentZone = zonesQuery.data?.find((z) => z.id === character.currentZoneId);
  const inTown = currentZone?.isTown ?? false;

  if (zonesQuery.data && !inTown) {
    return (
      <PanelFrame title="Kowadło">
        <p className="text-sm text-parchment-faint">Kowadło jest dostępne tylko w mieście.</p>
      </PanelFrame>
    );
  }

  const items = inventoryQuery.data ?? [];
  const byEquipSlot = new Map<EquipSlot, InventoryItemDto>();
  const byGridSlot = new Map<number, InventoryItemDto>();
  for (const item of items) {
    // A grid item placed on the anvil vacates its inventory slot — otherwise the same
    // inventoryItemId would render as two separate dnd-kit draggables at once. An EQUIPPED item
    // stays worn while it's being evaluated on the anvil, so it keeps rendering in its doll slot
    // too (as a static echo, not a second draggable — see equip-slot rendering below).
    if (item.equippedSlot) byEquipSlot.set(item.equippedSlot, item);
    else if (item.id === selectedId || selectedCatalystIds.includes(item.id)) continue;
    else if (
      item.activeSlotIndex === null &&
      (UPGRADABLE_TYPES.has(item.item.type) || item.item.type === "catalyst")
    )
      byGridSlot.set(item.slotIndex!, item);
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
  const baseChance = targetLevel !== null ? (levelConfig?.successChance ?? defaultUpgradeSuccessChance(targetLevel)) : null;
  const catalystBonusPct = selectedCatalystIds.reduce((sum, id) => {
    if (!id) return sum;
    const catalystItem = items.find((i) => i.id === id);
    return sum + (catalystItem?.item.catalystSuccessChanceBonusPct ?? 0);
  }, 0);
  const chance = baseChance !== null ? Math.min(1, baseChance + catalystBonusPct) : null;
  const goldCost = targetLevel !== null ? (levelConfig?.goldCost ?? defaultUpgradeGoldCost(targetLevel)) : null;
  const hasEnoughGold = goldCost !== null && character.gold >= goldCost;
  const requirements = selectedCatalogItem?.upgradeRequirements.filter((r) => r.targetLevel === targetLevel) ?? [];
  const hasPath = requirements.length > 0;
  const hasAllMaterials = requirements.every((r) => (ownedQtyByItemId.get(r.requiredItemId) ?? 0) >= r.requiredQty);
  const catalystSlotCount = Math.max(0, ANVIL_SLOT_COUNT - requirements.length);
  const isGatherTool = selected?.item.type === "rod" || selected?.item.type === "pickaxe";
  const gatherSuccessRequired = gatheringSettingsQuery.data?.successesPerToolUpgrade;
  const hasEnoughGatherSuccesses =
    !isGatherTool || gatherSuccessRequired === undefined || (selected?.gatherSuccessCount ?? 0) >= gatherSuccessRequired;

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
        <PanelFrame title="Założony ekwipunek">
          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center gap-3">
              {LEFT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item &&
                      (item.id === selectedId ? (
                        <AnvilEchoBox item={item} />
                      ) : (
                        <ItemBox inventoryItem={item} onSelect={() => selectItem(item.id)} />
                      ))}
                  </EquipSlotBox>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-3">
              {RIGHT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item &&
                      (item.id === selectedId ? (
                        <AnvilEchoBox item={item} />
                      ) : (
                        <ItemBox inventoryItem={item} onSelect={() => selectItem(item.id)} />
                      ))}
                  </EquipSlotBox>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-3">
              {TOOL_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item &&
                      (item.id === selectedId ? (
                        <AnvilEchoBox item={item} />
                      ) : (
                        <ItemBox
                          inventoryItem={item}
                          onSelect={() => selectItem(item.id)}
                          gatherSuccessRequired={gatheringSettingsQuery.data?.successesPerToolUpgrade}
                        />
                      ))}
                  </EquipSlotBox>
                );
              })}
            </div>
          </div>
        </PanelFrame>

        {/* Ekwipunek do wyboru — siatka materiałów/przedmiotów do ulepszenia. */}
        <PanelFrame title="Ekwipunek do wyboru">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-parchment-dim">Przeciągnij na kowadło albo kliknij</p>
            <div className="flex gap-1">
              {Array.from({ length: INVENTORY_TABS }, (_, tab) => (
                <TabDropButton
                  key={tab}
                  tab={tab}
                  active={activeTab === tab}
                  label={TAB_LABELS[tab]}
                  title={`Zakładka ${tab + 1} (${tabItemCounts[tab]} przedmiotów)`}
                  count={tabItemCounts[tab]}
                  onSelect={() => setActiveTab(tab)}
                />
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
                    onSelect={() => handlePickerSelect(cell.item!, catalystSlotCount)}
                    gatherSuccessRequired={gatheringSettingsQuery.data?.successesPerToolUpgrade}
                  />
                )}
              </GridSlot>
            ))}
          </div>
        </PanelFrame>

        {/* Kowadło — miejsce, w którym ląduje wybrany przedmiot, plus szczegóły ulepszenia. */}
        <PanelFrame title="Kowadło">
          <p className="text-xs text-parchment-faint">
            Przeciągnij przedmiot (z ekwipunku lub założony) tutaj, żeby go wybrać, albo kliknij.
          </p>
          <div className="mt-3 flex justify-center">
            <AnvilSlotBox>
              {selected && (
                <ItemBox
                  inventoryItem={selected}
                  selected
                  onSelect={() => selectItem(selected.id)}
                  gatherSuccessRequired={gatheringSettingsQuery.data?.successesPerToolUpgrade}
                />
              )}
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
                    {catalystBonusPct > 0 && (
                      <span className="ml-1 text-xs text-rarity-epic">
                        (baza {Math.round((baseChance ?? 0) * 100)}% + {Math.round(catalystBonusPct * 100)}% z
                        katalizatorów)
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-parchment-faint">
                    Przy porażce przedmiot zostaje zniszczony, a złoto, materiały i katalizatory przepadają.
                  </p>

                  <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-parchment-faint">
                    Wymagane materiały
                  </p>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {requirements.map((r) => (
                      <MaterialSlotBox
                        key={r.requiredItemId}
                        item={itemFor(r.requiredItemId)}
                        owned={ownedQtyByItemId.get(r.requiredItemId) ?? 0}
                        required={r.requiredQty}
                      />
                    ))}
                    {Array.from({ length: catalystSlotCount }, (_, i) => (
                      <CatalystSlotBox
                        key={`catalyst-${i}`}
                        index={i}
                        inventoryItem={items.find((it) => it.id === selectedCatalystIds[i]) ?? null}
                        onRemove={() => removeCatalystAt(i)}
                      />
                    ))}
                  </div>
                  {catalystSlotCount > 0 && (
                    <p className="mt-1.5 text-xs text-parchment-faint">
                      Puste kwadraty — przeciągnij tam ulepszacz z ekwipunku, żeby zwiększyć szansę powodzenia
                      (opcjonalne).
                    </p>
                  )}

                  {isGatherTool && gatherSuccessRequired !== undefined && (
                    <p className={`mt-3 text-sm ${hasEnoughGatherSuccesses ? "text-parchment-dim" : "text-red-400"}`}>
                      Udane zbiórki tym narzędziem: {selected.gatherSuccessCount}/{gatherSuccessRequired}
                      {!hasEnoughGatherSuccesses && " — za mało, by je ulepszyć."}
                    </p>
                  )}

                  <button
                    onClick={() =>
                      upgradeMutation.mutate({
                        inventoryItemId: selected.id,
                        catalystIds: selectedCatalystIds.filter((id): id is string => !!id),
                      })
                    }
                    disabled={upgradeMutation.isPending || !hasAllMaterials || !hasEnoughGold || !hasEnoughGatherSuccesses}
                    className="mt-4 w-full rounded-md bg-gold px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ulepsz przedmiot
                  </button>
                </>
              )}
            </>
          )}

          {resultMessage && (
            <p role="status" className="mt-3 text-sm text-rarity-uncommon">
              {resultMessage}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
        </PanelFrame>
      </div>
    </DndContext>
  );
}
