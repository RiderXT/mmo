import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, EquipSlot } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { EquipSlotBox } from "../../components/inventory/EquipSlotBox";
import { ActiveItemSlotBox } from "../../components/inventory/ActiveItemSlotBox";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemContextMenu, type ItemContextMenuTarget } from "../../components/inventory/ItemContextMenu";
import { StatsPanel } from "../../components/character/StatsPanel";
import { SkillsPanel } from "../../components/character/SkillsPanel";
import { VitalsPanel } from "../../components/character/VitalsPanel";
import { ApiError } from "../../lib/apiClient";
import { getCombatStatsBreakdown } from "../../lib/charactersApi";
import { getPlayerClass } from "../../lib/classesApi";
import { interpolateUpgrade } from "../../lib/statMath";
import { STAT_LABELS, TYPE_LABELS, formatStatValue, COMBAT_STAT_TO_STAT_KEY, formatBreakdownValue } from "../../lib/statFormat";
import { listPlayerItems } from "../../lib/itemsApi";
import {
  listInventory,
  moveItem,
  equipItem,
  unequipItem,
  setActiveSlot,
  clearActiveSlot,
  openChest,
  sellItem,
  discardItem,
  type InventoryItemDto,
} from "../../lib/inventoryApi";

const GRID_SLOTS = 24;
const ACTIVE_SLOTS = 6;
const LEFT_EQUIP_SLOTS: EquipSlot[] = ["helmet", "armor", "necklace", "boots"];
const RIGHT_EQUIP_SLOTS: EquipSlot[] = ["weapon", "ring", "earrings"];
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function CharacterTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chestResult, setChestResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [contextMenu, setContextMenu] = useState<ItemContextMenuTarget | null>(null);
  // Require a small pointer movement before a drag starts, so a plain click/tap
  // (to select an item and show its details) still fires instead of being
  // swallowed by the drag sensor.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });

  const classQuery = useQuery({
    queryKey: ["class", character.classId],
    queryFn: () => getPlayerClass(character.classId!),
    enabled: !!character.classId,
  });

  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });

  const breakdownQuery = useQuery({
    queryKey: ["combat-stats-breakdown", characterId],
    queryFn: () => getCombatStatsBreakdown(characterId),
  });

  function invalidateInventory() {
    queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
  }

  function invalidateInventoryAndCombatStats() {
    invalidateInventory();
    queryClient.invalidateQueries({ queryKey: ["combat-stats", characterId] });
    queryClient.invalidateQueries({ queryKey: ["combat-stats-breakdown", characterId] });
  }

  const moveMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; toSlotIndex: number }) =>
      moveItem(characterId, vars.inventoryItemId, vars.toSlotIndex),
    onSuccess: invalidateInventory,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się przenieść"),
  });

  const equipMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; equipSlot: EquipSlot }) =>
      equipItem(characterId, vars.inventoryItemId, vars.equipSlot),
    onSuccess: invalidateInventoryAndCombatStats,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie można założyć przedmiotu"),
  });

  const unequipMutation = useMutation({
    mutationFn: (inventoryItemId: string) => unequipItem(characterId, inventoryItemId),
    onSuccess: invalidateInventoryAndCombatStats,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się zdjąć przedmiotu"),
  });

  const openChestMutation = useMutation({
    mutationFn: (inventoryItemId: string) => openChest(characterId, inventoryItemId),
    onSuccess: (data) => {
      invalidateInventory();
      setActionError(null);
      setChestResult(
        data.awarded.length === 0
          ? "Skrzynia była pusta."
          : `Zdobyto: ${data.awarded
              .map((a) => `${itemsQuery.data?.find((i) => i.id === a.itemId)?.name ?? a.itemId} ×${a.quantity}`)
              .join(", ")}`,
      );
      setTimeout(() => setChestResult(null), 5000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się otworzyć skrzyni"),
  });

  const sellMutation = useMutation({
    mutationFn: (inventoryItemId: string) => sellItem(characterId, inventoryItemId),
    onSuccess: (data) => {
      invalidateInventory();
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
      setActionError(null);
      setChestResult(`Sprzedano za ${data.goldEarned} złota.`);
      setTimeout(() => setChestResult(null), 4000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się sprzedać przedmiotu"),
  });

  const discardMutation = useMutation({
    mutationFn: (inventoryItemId: string) => discardItem(characterId, inventoryItemId),
    onSuccess: () => {
      invalidateInventory();
      setActionError(null);
      if (selectedId) setSelectedId(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się usunąć przedmiotu"),
  });

  function handleItemContextMenu(item: InventoryItemDto, x: number, y: number) {
    setContextMenu({
      inventoryItemId: item.id,
      name: item.item.name,
      canOpen: item.item.type === "chest",
      canSell: item.item.sellPrice > 0 && !item.equippedSlot,
      x,
      y,
    });
  }

  const setActiveSlotMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; slotIndex: number }) =>
      setActiveSlot(characterId, vars.inventoryItemId, vars.slotIndex),
    onSuccess: invalidateInventory,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Nie można umieścić przedmiotu w tym slocie"),
  });

  const clearActiveSlotMutation = useMutation({
    mutationFn: (inventoryItemId: string) => clearActiveSlot(characterId, inventoryItemId),
    onSuccess: invalidateInventory,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się usunąć ze slotu"),
  });

  function handleDragEnd(event: DragEndEvent) {
    setActionError(null);
    const { active, over } = event;
    if (!over) return;

    const inventoryItem = active.data.current?.inventoryItem as InventoryItemDto | undefined;
    if (!inventoryItem) return;

    const overType = over.data.current?.type as "grid" | "equip" | "active" | undefined;

    if (overType === "grid") {
      const toSlotIndex = over.data.current?.slotIndex as number;
      if (inventoryItem.equippedSlot) {
        unequipMutation.mutate(inventoryItem.id);
      } else if (inventoryItem.activeSlotIndex !== null) {
        clearActiveSlotMutation.mutate(inventoryItem.id);
      } else if (toSlotIndex !== inventoryItem.slotIndex) {
        moveMutation.mutate({ inventoryItemId: inventoryItem.id, toSlotIndex });
      }
    } else if (overType === "equip") {
      const equipSlot = over.data.current?.equipSlot as EquipSlot;
      equipMutation.mutate({ inventoryItemId: inventoryItem.id, equipSlot });
    } else if (overType === "active") {
      const slotIndex = over.data.current?.slotIndex as number;
      setActiveSlotMutation.mutate({ inventoryItemId: inventoryItem.id, slotIndex });
    }
  }

  const items = inventoryQuery.data ?? [];
  const byGridSlot = new Map<number, InventoryItemDto>();
  const byEquipSlot = new Map<EquipSlot, InventoryItemDto>();
  const byActiveSlot = new Map<number, InventoryItemDto>();
  for (const item of items) {
    if (item.equippedSlot) byEquipSlot.set(item.equippedSlot, item);
    else if (item.activeSlotIndex !== null) byActiveSlot.set(item.activeSlotIndex, item);
    else byGridSlot.set(item.slotIndex, item);
  }
  const tabItemCounts = Array.from({ length: INVENTORY_TABS }, (_, tab) => {
    let count = 0;
    for (const slotIndex of byGridSlot.keys()) {
      if (Math.floor(slotIndex / GRID_SLOTS) === tab) count += 1;
    }
    return count;
  });

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <VitalsPanel characterId={character.id} />
        <StatsPanel character={character} />
        <SkillsPanel character={character} />
      </div>

      {breakdownQuery.data && (
        <div className="mt-4 panel p-4">
          <h2 className="font-medium text-parchment">Statystyki bojowe — źródło</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-parchment-dim">
                <tr>
                  <th className="py-1 pr-3">Staty</th>
                  <th className="px-2 py-1 text-right">Baza</th>
                  <th className="px-2 py-1 text-right">Ekwipunek</th>
                  <th className="px-2 py-1 text-right">Umiejętności</th>
                  <th className="py-1 pl-2 text-right">Razem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(Object.keys(COMBAT_STAT_TO_STAT_KEY) as (keyof typeof COMBAT_STAT_TO_STAT_KEY)[]).map((key) => {
                  const c = breakdownQuery.data[key];
                  return (
                    <tr key={key}>
                      <td className="py-1 pr-3 text-parchment-dim">{STAT_LABELS[COMBAT_STAT_TO_STAT_KEY[key]]}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.base)}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.equipment)}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.passive)}</td>
                      <td className="py-1 pl-2 text-right font-medium text-parchment">{formatBreakdownValue(key, c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="mt-6 flex flex-wrap gap-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_auto_auto] sm:items-center">
            <div className="flex flex-col items-center gap-3">
              {LEFT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                        onContextMenu={handleItemContextMenu}
                      />
                    )}
                  </EquipSlotBox>
                );
              })}
            </div>

            <div className="flex flex-col items-center justify-self-center">
              <div className="flex h-40 w-32 items-center justify-center rounded-xl border border-gold/40 text-center text-[11px] text-parchment-faint shadow-[inset_0_0_40px_rgba(230,180,90,0.1)]" style={{ background: "repeating-linear-gradient(45deg, oklch(20% 0.02 45), oklch(20% 0.02 45) 10px, oklch(17% 0.02 45) 10px, oklch(17% 0.02 45) 20px)" }}>
                postać gracza
                <br />
                (grafika)
              </div>
              <div className="mt-3 font-display text-base font-bold text-parchment">{character.name}</div>
              <div className="text-xs text-gold">
                {classQuery.data?.name ?? "…"} · lvl. {character.level}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              {RIGHT_EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                        onContextMenu={handleItemContextMenu}
                      />
                    )}
                  </EquipSlotBox>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-parchment-dim">
              Aktywne itemy (potiony — zużywane automatycznie na ekspedycji)
            </p>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: ACTIVE_SLOTS }, (_, slotIndex) => {
                const item = byActiveSlot.get(slotIndex);
                return (
                  <ActiveItemSlotBox key={slotIndex} slotIndex={slotIndex}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                        onContextMenu={handleItemContextMenu}
                      />
                    )}
                  </ActiveItemSlotBox>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-parchment-dim">Ekwipunek (przeciągnij, by przenieść)</p>
              <div className="flex gap-1">
                {Array.from({ length: INVENTORY_TABS }, (_, tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
                      activeTab === tab
                        ? "bg-gold text-ink"
                        : "bg-panel-raised text-parchment-dim hover:bg-line-soft"
                    } ${tabItemCounts[tab] > 0 ? "" : "opacity-60"}`}
                    title={`Zakładka ${tab + 1} (${tabItemCounts[tab]} przedmiotów)`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: GRID_SLOTS }, (_, slotInTab) => {
                const slotIndex = activeTab * GRID_SLOTS + slotInTab;
                const item = byGridSlot.get(slotIndex);
                return (
                  <GridSlot key={slotIndex} slotIndex={slotIndex}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                        onContextMenu={handleItemContextMenu}
                      />
                    )}
                  </GridSlot>
                );
              })}
            </div>
          </div>
        </div>
      </DndContext>

      {actionError && <p className="mt-3 text-sm text-red-400">{actionError}</p>}
      {chestResult && <p className="mt-3 text-sm text-rarity-uncommon">{chestResult}</p>}

      {selected && (
        <div className="mt-6 max-w-sm space-y-2 panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-parchment">
              {selected.item.name}
              {selected.upgradeLevel > 0 && <span className="text-gold-bright"> +{selected.upgradeLevel}</span>}
            </h2>
            <button onClick={() => setSelectedId(null)} className="text-xs text-parchment-faint hover:text-parchment-dim">
              zamknij
            </button>
          </div>
          <p className="text-xs text-parchment-faint">
            {TYPE_LABELS[selected.item.type] ?? selected.item.type} · od poziomu {selected.item.minLevel}
            {selected.item.class ? ` · dla klasy: ${selected.item.class.name}` : " · uniwersalny"}
            {selected.equippedSlot ? ` · założony (${selected.equippedSlot})` : ""}
            {selected.activeSlotIndex !== null ? ` · aktywny slot ${selected.activeSlotIndex + 1}` : ""}
          </p>
          {selected.item.description && <p className="text-sm text-parchment-dim">{selected.item.description}</p>}
          <div className="text-sm text-parchment-dim">
            {Object.entries({
              ...interpolateUpgrade(selected.item.baseStats, selected.item.maxUpgradeStats, selected.upgradeLevel),
              ...selected.rolledStats,
            })
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className="mr-3 inline-block">
                  {STAT_LABELS[k as keyof typeof STAT_LABELS] ?? k}: {formatStatValue(k as keyof typeof STAT_LABELS, v as number)}
                </span>
              ))}
          </div>
          {selected.item.type !== "consumable" && (
            <p className="text-xs text-parchment-faint">Ulepszanie — zobacz zakładkę "Kowadło".</p>
          )}
        </div>
      )}

      {contextMenu && (
        <ItemContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpen={(id) => openChestMutation.mutate(id)}
          onSell={(id) => sellMutation.mutate(id)}
          onDiscard={(id) => discardMutation.mutate(id)}
        />
      )}
    </div>
  );
}
