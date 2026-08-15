import { useState } from "react";
import { useParams } from "react-router-dom";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EquipSlot } from "@mmo/shared";
import { AppShell } from "../components/AppShell";
import { GridSlot } from "../components/inventory/GridSlot";
import { EquipSlotBox } from "../components/inventory/EquipSlotBox";
import { ActiveItemSlotBox } from "../components/inventory/ActiveItemSlotBox";
import { ItemBox } from "../components/inventory/ItemBox";
import { ExpeditionPanel } from "../components/expedition/ExpeditionPanel";
import { StatsPanel } from "../components/character/StatsPanel";
import { SkillsPanel } from "../components/character/SkillsPanel";
import { VitalsPanel } from "../components/character/VitalsPanel";
import { ApiError } from "../lib/apiClient";
import { getCharacter } from "../lib/charactersApi";
import {
  listInventory,
  moveItem,
  equipItem,
  unequipItem,
  upgradeItem,
  setActiveSlot,
  clearActiveSlot,
  type InventoryItemDto,
} from "../lib/inventoryApi";

const GRID_SLOTS = 24;
const ACTIVE_SLOTS = 6;
const EQUIP_SLOTS: EquipSlot[] = ["weapon", "armor", "helmet", "boots", "necklace", "earrings", "ring"];
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function GamePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  // Require a small pointer movement before a drag starts, so a plain click/tap
  // (to select an item and show its details) still fires instead of being
  // swallowed by the drag sensor.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const characterQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => getCharacter(characterId!),
    enabled: !!characterId,
  });

  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId!),
    enabled: !!characterId,
  });

  function invalidateInventory() {
    queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
  }

  function invalidateInventoryAndCombatStats() {
    invalidateInventory();
    queryClient.invalidateQueries({ queryKey: ["combat-stats", characterId] });
  }

  const moveMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; toSlotIndex: number }) =>
      moveItem(characterId!, vars.inventoryItemId, vars.toSlotIndex),
    onSuccess: invalidateInventory,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się przenieść"),
  });

  const equipMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; equipSlot: EquipSlot }) =>
      equipItem(characterId!, vars.inventoryItemId, vars.equipSlot),
    onSuccess: invalidateInventoryAndCombatStats,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie można założyć przedmiotu"),
  });

  const unequipMutation = useMutation({
    mutationFn: (inventoryItemId: string) => unequipItem(characterId!, inventoryItemId),
    onSuccess: invalidateInventoryAndCombatStats,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się zdjąć przedmiotu"),
  });

  const upgradeMutation = useMutation({
    mutationFn: (inventoryItemId: string) => upgradeItem(characterId!, inventoryItemId),
    onSuccess: () => {
      invalidateInventory();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się ulepszyć"),
  });

  const setActiveSlotMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; slotIndex: number }) =>
      setActiveSlot(characterId!, vars.inventoryItemId, vars.slotIndex),
    onSuccess: invalidateInventory,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Nie można umieścić przedmiotu w tym slocie"),
  });

  const clearActiveSlotMutation = useMutation({
    mutationFn: (inventoryItemId: string) => clearActiveSlot(characterId!, inventoryItemId),
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
  const character = characterQuery.data;

  if (!characterId) {
    return (
      <AppShell>
        <p className="text-slate-400">Wybierz postać z listy.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-100">{character?.name ?? "…"}</h1>
        {character && (
          <p className="text-sm text-slate-400">
            Poziom {character.level} · {character.exp} exp · {character.gold} złota
          </p>
        )}
      </div>

      {character && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <VitalsPanel characterId={character.id} />
          <StatsPanel character={character} />
          <SkillsPanel character={character} />
        </div>
      )}

      {character && (
        <div className="mt-4">
          <ExpeditionPanel
            characterId={characterId}
            characterLevel={character.level}
            onClaimed={() => queryClient.invalidateQueries({ queryKey: ["character", characterId] })}
          />
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="mt-6 flex flex-wrap gap-8">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Założony ekwipunek</p>
            <div className="flex flex-wrap gap-3">
              {EQUIP_SLOTS.map((slot) => {
                const item = byEquipSlot.get(slot);
                return (
                  <EquipSlotBox key={slot} slot={slot}>
                    {item && (
                      <ItemBox
                        inventoryItem={item}
                        selected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    )}
                  </EquipSlotBox>
                );
              })}
            </div>

            <p className="mb-2 mt-4 text-xs font-medium text-slate-400">
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
                      />
                    )}
                  </ActiveItemSlotBox>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Ekwipunek (przeciągnij, by przenieść)</p>
              <div className="flex gap-1">
                {Array.from({ length: INVENTORY_TABS }, (_, tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
                      activeTab === tab
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
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

      {selected && (
        <div className="mt-6 max-w-sm space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-100">
              {selected.item.name}
              {selected.upgradeLevel > 0 && <span className="text-amber-300"> +{selected.upgradeLevel}</span>}
            </h2>
            <button onClick={() => setSelectedId(null)} className="text-xs text-slate-500 hover:text-slate-300">
              zamknij
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {selected.item.type} · poziom min. {selected.item.minLevel}
            {selected.equippedSlot ? ` · założony (${selected.equippedSlot})` : ""}
            {selected.activeSlotIndex !== null ? ` · aktywny slot ${selected.activeSlotIndex + 1}` : ""}
          </p>
          {selected.item.description && <p className="text-sm text-slate-400">{selected.item.description}</p>}
          <div className="text-sm text-slate-300">
            {Object.entries({ ...selected.item.baseStats, ...selected.rolledStats })
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className="mr-3 inline-block">
                  {k}: {v}
                </span>
              ))}
          </div>
          {selected.item.type !== "consumable" && (
            <button
              onClick={() => upgradeMutation.mutate(selected.id)}
              disabled={upgradeMutation.isPending}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Ulepsz
            </button>
          )}
        </div>
      )}
    </AppShell>
  );
}
