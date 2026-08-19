import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, EquipSlot } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { EquipSlotBox } from "../../components/inventory/EquipSlotBox";
import { ActiveItemSlotBox } from "../../components/inventory/ActiveItemSlotBox";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemContextMenu, type ItemContextMenuTarget } from "../../components/inventory/ItemContextMenu";
import { PotionThresholdModal } from "../../components/inventory/PotionThresholdModal";
import { PanelFrame } from "../../components/common/PanelFrame";
import { ApiError } from "../../lib/apiClient";
import { getPlayerClass } from "../../lib/classesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { layoutGridTab, INVENTORY_GRID_SLOTS_PER_TAB } from "../../lib/inventoryGrid";
import {
  listInventory,
  moveItem,
  equipItem,
  unequipItem,
  setActiveSlot,
  clearActiveSlot,
  setPotionThresholdOverride,
  openChest,
  sellItem,
  discardItem,
  type InventoryItemDto,
} from "../../lib/inventoryApi";
import { readBook } from "../../lib/passiveSkillsApi";
import { getGatheringSettings } from "../../lib/gatheringApi";

const GRID_SLOTS = INVENTORY_GRID_SLOTS_PER_TAB;
const ACTIVE_SLOTS = 6;
// Mirrors a classic equipment doll: helmet/armor/boots down the center, necklace+ring and
// shield+earrings stacked in the two flanking columns (same combined height as the tall armor
// socket), weapon alone on the outer right edge.
const CENTER_EQUIP_SLOTS: EquipSlot[] = ["helmet", "armor", "boots"];
const COL1_SLOTS: EquipSlot[] = ["necklace", "ring"];
const COL2_SLOTS: EquipSlot[] = ["shield", "earrings"];
const RIGHT_EQUIP_SLOTS: EquipSlot[] = ["weapon"];
// Gathering tools — carried, not worn, so they get their own labeled row below the doll instead
// of a spot in the humanoid silhouette (see "Narzędzia zbieractwa" below). Backend has supported
// equipping these since the gathering system shipped (inventory/service.ts
// EQUIPPABLE_SLOTS_BY_TYPE), but the doll never grew sockets for them — nothing in the UI could
// actually populate equippedSlot "rod"/"pickaxe", so GatheringPanel's "Załóż wędkę" gate was
// permanently unsatisfiable.
const TOOL_EQUIP_SLOTS: EquipSlot[] = ["rod", "pickaxe"];
// weapon/armor occupy 2 grid cells (Item.gridWidth) — size their equip socket to match instead of
// cramming a tall item into a 1-cell box.
const TALL_EQUIP_SLOTS = new Set<EquipSlot>(["weapon", "armor"]);
// Item types with a rendered socket in this doll — drives the context menu's "Załóż" entry
// (since dnd-kit drag alone is unreachable on mobile; see critique 2026-08-17) and the tooltip's
// equipped-item stat comparison.
const EQUIPPABLE_TYPES = new Set<string>([
  ...COL1_SLOTS,
  ...COL2_SLOTS,
  ...CENTER_EQUIP_SLOTS,
  ...RIGHT_EQUIP_SLOTS,
  ...TOOL_EQUIP_SLOTS,
]);
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function EquipmentTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [chestResult, setChestResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [contextMenu, setContextMenu] = useState<ItemContextMenuTarget | null>(null);
  const [thresholdTarget, setThresholdTarget] = useState<InventoryItemDto | null>(null);
  // Require a small pointer movement before a drag starts, so a plain click/tap doesn't get
  // swallowed by the drag sensor as an accidental micro-drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });
  const gatheringSettingsQuery = useQuery({ queryKey: ["gathering-settings"], queryFn: getGatheringSettings });

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
    // A "miejsce zajęte" rejection means the client's view of the grid disagrees with the
    // server's (e.g. a drop resolved elsewhere landed an item in that slot since the last
    // fetch) — refetch so the grid immediately shows what's actually there instead of leaving
    // a slot that looks empty but keeps rejecting every move into it.
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Nie udało się przenieść");
      invalidateInventory();
    },
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
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się usunąć przedmiotu"),
  });

  const setPotionThresholdMutation = useMutation({
    mutationFn: (vars: { inventoryItemId: string; thresholdPct: number | null }) =>
      setPotionThresholdOverride(characterId, vars.inventoryItemId, vars.thresholdPct),
    onSuccess: invalidateInventory,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się ustawić progu użycia"),
  });

  const readBookMutation = useMutation({
    mutationFn: (inventoryItemId: string) => readBook(characterId, inventoryItemId),
    onSuccess: (data) => {
      invalidateInventory();
      queryClient.invalidateQueries({ queryKey: ["passive-skills", characterId] });
      setActionError(null);
      setChestResult(
        data.success
          ? `Przeczytano książkę — ${data.skillName}: poziom ${data.newLevel}!`
          : `Nie udało się nauczyć (${data.skillName}) — książka zużyta.`,
      );
      setTimeout(() => setChestResult(null), 5000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się przeczytać książki"),
  });

  // Tap-to-activate: assigns the first free active slot rather than letting the caller pick one,
  // so this path can never target an already-occupied slot.
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
    const equippable = !item.equippedSlot && item.activeSlotIndex === null && EQUIPPABLE_TYPES.has(item.item.type);
    const activatable =
      !item.equippedSlot &&
      item.activeSlotIndex === null &&
      (item.item.type === "consumable" || item.item.type === "bait");
    setContextMenu({
      inventoryItemId: item.id,
      name: item.item.name,
      upgradeLevel: item.upgradeLevel,
      canOpen: item.item.type === "chest",
      canSell: item.item.sellPrice > 0 && !item.equippedSlot,
      canEquip: equippable,
      equipSlot: equippable ? (item.item.type as EquipSlot) : null,
      canUnequip: !!item.equippedSlot,
      canActivate: activatable,
      canDeactivate: item.activeSlotIndex !== null,
      canConfigureThreshold:
        item.activeSlotIndex !== null &&
        (item.item.potionTrigger === "hp_below" || item.item.potionTrigger === "mana_below"),
      canRead: item.item.type === "book",
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

  function renderEquipSlot(slot: EquipSlot, gridClassName: string) {
    const item = byEquipSlot.get(slot);
    const tall = TALL_EQUIP_SLOTS.has(slot);
    return (
      <div key={slot} className={gridClassName}>
        <EquipSlotBox slot={slot} tall={tall}>
          {item && (
            <ItemBox
              inventoryItem={item}
              tall={tall}
              onContextMenu={handleItemContextMenu}
              gatherSuccessRequired={gatheringSettingsQuery.data?.successesPerToolUpgrade}
            />
          )}
        </EquipSlotBox>
      </div>
    );
  }

  return (
    <div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-wrap gap-8">
          <PanelFrame title="Ekwipunek" bodyClassName="flex flex-col items-center gap-4">
            <div className="grid grid-cols-[auto_auto_auto_auto] gap-3">
              {renderEquipSlot("helmet", "col-start-3 row-start-1")}
              {renderEquipSlot("necklace", "col-start-1 row-start-2")}
              {renderEquipSlot("shield", "col-start-2 row-start-2")}
              {renderEquipSlot("armor", "col-start-3 row-start-2 row-span-2")}
              {renderEquipSlot("weapon", "col-start-4 row-start-2 row-span-2")}
              {renderEquipSlot("ring", "col-start-1 row-start-3")}
              {renderEquipSlot("earrings", "col-start-2 row-start-3")}
              {renderEquipSlot("boots", "col-start-3 row-start-4")}
            </div>

            <div className="text-center">
              <div className="font-display text-base font-bold text-parchment">{character.name}</div>
              <div className="text-xs text-gold">
                {classQuery.data?.name ?? "…"} · lvl. {character.level}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Narzędzia zbieractwa (wędka do łowienia, kilof do kopalni)
              </p>
              <div className="flex justify-center gap-3">
                {TOOL_EQUIP_SLOTS.map((slot) => renderEquipSlot(slot, ""))}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <p className="mb-2 text-xs font-medium text-parchment-dim">
                Aktywne itemy (potiony — zużywane automatycznie na ekspedycji)
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {Array.from({ length: ACTIVE_SLOTS }, (_, slotIndex) => {
                  const item = byActiveSlot.get(slotIndex);
                  return (
                    <ActiveItemSlotBox key={slotIndex} slotIndex={slotIndex}>
                      {item && (
                        <ItemBox inventoryItem={item} onContextMenu={handleItemContextMenu} alwaysShowQuantity />
                      )}
                    </ActiveItemSlotBox>
                  );
                })}
              </div>
            </div>
          </PanelFrame>

          <PanelFrame title="Inwentarz">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-parchment-dim">Przeciągnij, by przenieść</p>
              <div className="flex gap-1">
                {Array.from({ length: INVENTORY_TABS }, (_, tab) => {
                  const tabLabel = `Zakładka ${tab + 1} (${tabItemCounts[tab]} przedmiotów)`;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
                        activeTab === tab
                          ? "bg-gold text-ink"
                          : "bg-panel-raised text-parchment-dim hover:bg-line-soft"
                      } ${tabItemCounts[tab] > 0 ? "" : "opacity-60"}`}
                      title={tabLabel}
                      aria-label={tabLabel}
                    >
                      {TAB_LABELS[tab]}
                      {tabItemCounts[tab] > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full border border-line-soft bg-ink px-0.5 text-[9px] font-semibold leading-none text-gold-bright"
                        >
                          {tabItemCounts[tab]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {tabItemCounts[activeTab] === 0 && (
              <p className="mb-2 text-xs text-parchment-faint">Brak przedmiotów w tej zakładce.</p>
            )}
            <div className="grid grid-cols-5 gap-2">
              {layoutGridTab(byGridSlot, activeTab * GRID_SLOTS).map((cell) => (
                <GridSlot key={cell.slotIndex} slotIndex={cell.slotIndex} height={cell.height}>
                  {cell.item && (
                    <ItemBox
                      inventoryItem={cell.item}
                      tall={cell.height === 2}
                      onContextMenu={handleItemContextMenu}
                      equippedComparisonItem={
                        EQUIPPABLE_TYPES.has(cell.item.item.type)
                          ? byEquipSlot.get(cell.item.item.type as EquipSlot) ?? null
                          : undefined
                      }
                      characterClassId={character.classId}
                      gatherSuccessRequired={gatheringSettingsQuery.data?.successesPerToolUpgrade}
                    />
                  )}
                </GridSlot>
              ))}
            </div>
          </PanelFrame>
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

      {contextMenu && (
        <ItemContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpen={(id) => openChestMutation.mutate(id)}
          onSell={(id) => sellMutation.mutate(id)}
          onDiscard={(id) => discardMutation.mutate(id)}
          onEquip={(id, equipSlot) => equipMutation.mutate({ inventoryItemId: id, equipSlot })}
          onUnequip={(id) => unequipMutation.mutate(id)}
          onActivate={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) handleActivate(item);
          }}
          onDeactivate={(id) => clearActiveSlotMutation.mutate(id)}
          onConfigureThreshold={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) setThresholdTarget(item);
          }}
          onRead={(id) => readBookMutation.mutate(id)}
        />
      )}

      {thresholdTarget && thresholdTarget.item.potionTrigger != null && thresholdTarget.item.potionTrigger !== "interval" && (
        <PotionThresholdModal
          itemName={thresholdTarget.item.name}
          trigger={thresholdTarget.item.potionTrigger}
          currentPct={thresholdTarget.potionThresholdOverridePct ?? thresholdTarget.item.potionThresholdPct ?? 0.3}
          hasOverride={thresholdTarget.potionThresholdOverridePct != null}
          onSave={(pct) => {
            setPotionThresholdMutation.mutate({ inventoryItemId: thresholdTarget.id, thresholdPct: pct });
            setThresholdTarget(null);
          }}
          onCancel={() => setThresholdTarget(null)}
        />
      )}
    </div>
  );
}
