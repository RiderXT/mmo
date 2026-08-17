import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, EquipSlot } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { EquipSlotBox } from "../../components/inventory/EquipSlotBox";
import { ActiveItemSlotBox } from "../../components/inventory/ActiveItemSlotBox";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemContextMenu, type ItemContextMenuTarget } from "../../components/inventory/ItemContextMenu";
import { ApiError } from "../../lib/apiClient";
import { getPlayerClass } from "../../lib/classesApi";
import { interpolateUpgrade } from "../../lib/statMath";
import { STAT_LABELS, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";
import { listPlayerItems } from "../../lib/itemsApi";
import { layoutGridTab, INVENTORY_GRID_SLOTS_PER_TAB } from "../../lib/inventoryGrid";
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

const GRID_SLOTS = INVENTORY_GRID_SLOTS_PER_TAB;
const ACTIVE_SLOTS = 6;
// Mirrors a classic equipment doll: armor pieces down the center, weapon/shield on the
// off-hand/main-hand side, jewelry on the other.
const LEFT_EQUIP_SLOTS: EquipSlot[] = ["ring", "earrings", "necklace"];
const CENTER_EQUIP_SLOTS: EquipSlot[] = ["helmet", "armor", "boots"];
const RIGHT_EQUIP_SLOTS: EquipSlot[] = ["weapon", "shield"];
// weapon/armor occupy 2 grid cells (Item.gridWidth) — size their equip socket to match instead of
// cramming a tall item into a 1-cell box.
const TALL_EQUIP_SLOTS = new Set<EquipSlot>(["weapon", "armor"]);
// Item types with a rendered socket in this doll — drives the tap-to-equip button in the detail
// panel, since dnd-kit drag alone is unreachable on mobile (source item and target socket are
// often both off-screen at once; see critique 2026-08-17).
const EQUIPPABLE_TYPES = new Set<string>([...LEFT_EQUIP_SLOTS, ...CENTER_EQUIP_SLOTS, ...RIGHT_EQUIP_SLOTS]);
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function EquipmentTab({ character }: { character: Character }) {
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

  // Tap-to-activate: assigns the first free active slot rather than letting the caller pick one,
  // so this path can never target an already-occupied slot — setActiveSlot silently orphans
  // whatever item it bumps (clears its activeSlotIndex without giving it back a grid slotIndex),
  // a pre-existing backend bug out of scope here. Only the slot-picking drag path can hit it.
  function handleActivate(item: InventoryItemDto) {
    for (let slotIndex = 0; slotIndex < ACTIVE_SLOTS; slotIndex++) {
      if (!byActiveSlot.has(slotIndex)) {
        setActiveSlotMutation.mutate({ inventoryItemId: item.id, slotIndex });
        return;
      }
    }
    setActionError("Wszystkie aktywne sloty są zajęte — zwolnij jeden, żeby założyć kolejną miksturę.");
  }

  function handleItemContextMenu(item: InventoryItemDto, x: number, y: number) {
    setContextMenu({
      inventoryItemId: item.id,
      name: item.item.name,
      upgradeLevel: item.upgradeLevel,
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
    else byGridSlot.set(item.slotIndex!, item);
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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-wrap gap-8">
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
              <div className="flex flex-col items-center gap-3">
                {CENTER_EQUIP_SLOTS.map((slot) => {
                  const item = byEquipSlot.get(slot);
                  return (
                    <EquipSlotBox key={slot} slot={slot} tall={TALL_EQUIP_SLOTS.has(slot)}>
                      {item && (
                        <ItemBox
                          inventoryItem={item}
                          tall={TALL_EQUIP_SLOTS.has(slot)}
                          selected={item.id === selectedId}
                          onSelect={() => setSelectedId(item.id)}
                          onContextMenu={handleItemContextMenu}
                        />
                      )}
                    </EquipSlotBox>
                  );
                })}
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
                  <EquipSlotBox key={slot} slot={slot} tall={TALL_EQUIP_SLOTS.has(slot)}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        tall={TALL_EQUIP_SLOTS.has(slot)}
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
            <div className="grid grid-cols-5 gap-2">
              {layoutGridTab(byGridSlot, activeTab * GRID_SLOTS).map((cell) => (
                <GridSlot key={cell.slotIndex} slotIndex={cell.slotIndex} height={cell.height}>
                  {cell.item && (
                    <ItemBox
                      inventoryItem={cell.item}
                      tall={cell.height === 2}
                      selected={cell.item.id === selectedId}
                      onSelect={() => setSelectedId(cell.item!.id)}
                      onContextMenu={handleItemContextMenu}
                    />
                  )}
                </GridSlot>
              ))}
            </div>
          </div>
        </div>
      </DndContext>

      {actionError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {actionError}
        </p>
      )}
      {chestResult && (
        <p role="status" className="mt-3 text-sm text-rarity-uncommon">
          {chestResult}
        </p>
      )}

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
          <div className="flex flex-wrap gap-2 pt-1">
            {selected.equippedSlot && (
              <button
                onClick={() => unequipMutation.mutate(selected.id)}
                disabled={unequipMutation.isPending}
                className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                Zdejmij
              </button>
            )}
            {!selected.equippedSlot && selected.activeSlotIndex === null && EQUIPPABLE_TYPES.has(selected.item.type) && (
              <button
                onClick={() => equipMutation.mutate({ inventoryItemId: selected.id, equipSlot: selected.item.type as EquipSlot })}
                disabled={equipMutation.isPending}
                className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Załóż
              </button>
            )}
            {selected.activeSlotIndex !== null && (
              <button
                onClick={() => clearActiveSlotMutation.mutate(selected.id)}
                disabled={clearActiveSlotMutation.isPending}
                className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                Wyjmij ze slotu
              </button>
            )}
            {!selected.equippedSlot &&
              selected.activeSlotIndex === null &&
              (selected.item.type === "consumable" || selected.item.type === "bait") && (
                <button
                  onClick={() => handleActivate(selected)}
                  disabled={setActiveSlotMutation.isPending}
                  className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aktywuj
                </button>
              )}
          </div>
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
