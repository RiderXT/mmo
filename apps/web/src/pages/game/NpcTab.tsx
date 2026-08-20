import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ShopItemBox } from "../../components/inventory/ShopItemBox";
import { ItemContextMenu, type ItemContextMenuTarget } from "../../components/inventory/ItemContextMenu";
import { BuyItemModal } from "../../components/expedition/BuyItemModal";
import { PanelFrame } from "../../components/common/PanelFrame";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { listPlayerClasses } from "../../lib/classesApi";
import { listInventory, sellItem, discardItem, openChest, type InventoryItemDto } from "../../lib/inventoryApi";
import { listNpcsForZone, buyFromNpc, type NpcShopItemPublicDto } from "../../lib/npcShopApi";
import { layoutGridTab, INVENTORY_GRID_SLOTS_PER_TAB } from "../../lib/inventoryGrid";

const GRID_SLOTS = INVENTORY_GRID_SLOTS_PER_TAB;
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

export function NpcTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [activeTab, setActiveTab] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkSelling, setBulkSelling] = useState(false);
  const [contextMenu, setContextMenu] = useState<ItemContextMenuTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [buyTarget, setBuyTarget] = useState<NpcShopItemPublicDto | null>(null);

  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const inventoryQuery = useQuery({ queryKey: ["inventory", characterId], queryFn: () => listInventory(characterId) });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });

  const currentZone = zonesQuery.data?.find((z) => z.id === character.currentZoneId);
  const inTown = currentZone?.isTown ?? false;

  const npcsQuery = useQuery({
    queryKey: ["npc-shop-zone", currentZone?.id],
    queryFn: () => listNpcsForZone(currentZone!.id),
    enabled: !!currentZone && inTown,
  });
  const classesQuery = useQuery({ queryKey: ["player-classes"], queryFn: listPlayerClasses });

  const itemFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId);
  const classNameFor = (classId: string) => classesQuery.data?.find((c) => c.id === classId)?.name ?? null;

  function invalidateAfterTrade() {
    queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
  }

  const sellMutation = useMutation({
    mutationFn: (inventoryItemId: string) => sellItem(characterId, inventoryItemId),
    onSuccess: (data) => {
      invalidateAfterTrade();
      setActionError(null);
      setActionMessage(`Sprzedano za ${data.goldEarned} złota.`);
      setTimeout(() => setActionMessage(null), 4000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się sprzedać przedmiotu"),
  });

  const discardMutation = useMutation({
    mutationFn: (inventoryItemId: string) => discardItem(characterId, inventoryItemId),
    onSuccess: () => {
      invalidateAfterTrade();
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się usunąć przedmiotu"),
  });

  const openChestMutation = useMutation({
    mutationFn: (inventoryItemId: string) => openChest(characterId, inventoryItemId),
    onSuccess: (data) => {
      invalidateAfterTrade();
      setActionError(null);
      setActionMessage(
        data.awarded.length === 0
          ? "Skrzynia była pusta."
          : `Zdobyto: ${data.awarded
              .map((a) => `${itemFor(a.itemId)?.name ?? a.itemId} ×${a.quantity}`)
              .join(", ")}`,
      );
      setTimeout(() => setActionMessage(null), 5000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się otworzyć skrzyni"),
  });

  const buyMutation = useMutation({
    mutationFn: (vars: { npcShopItemId: string; quantity: number }) =>
      buyFromNpc(characterId, vars.npcShopItemId, vars.quantity),
    onSuccess: (result) => {
      invalidateAfterTrade();
      queryClient.invalidateQueries({ queryKey: ["npc-shop-zone", currentZone?.id] });
      setActionError(null);
      setBuyTarget(null);
      setActionMessage(
        `Kupiono ${itemFor(result.itemId)?.name ?? result.itemId} ×${result.quantity} za ${result.totalPrice} złota.`,
      );
      setTimeout(() => setActionMessage(null), 4000);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Nie udało się kupić przedmiotu"),
  });

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

  function toggleSelected(item: InventoryItemDto) {
    if (item.item.sellPrice <= 0) {
      setActionError(`"${item.item.name}" nie ma ustalonej wartości sprzedaży — nie można go zaznaczyć.`);
      return;
    }
    setActionError(null);
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function sellSelection() {
    setBulkSelling(true);
    let earned = 0;
    let failed = 0;
    for (const id of selection) {
      try {
        const result = await sellItem(characterId, id);
        earned += result.goldEarned;
      } catch {
        failed += 1;
      }
    }
    setBulkSelling(false);
    setSelection(new Set());
    setSelectMode(false);
    invalidateAfterTrade();
    setActionError(null);
    setActionMessage(failed > 0 ? `Sprzedano za ${earned} złota (${failed} nieudanych).` : `Sprzedano za ${earned} złota.`);
    setTimeout(() => setActionMessage(null), 5000);
  }

  if (zonesQuery.data && !inTown) {
    return (
      <PanelFrame title="NPC">
        <p className="mt-2 text-sm text-parchment-faint">Handel z NPC jest dostępny tylko w mieście.</p>
      </PanelFrame>
    );
  }

  const items = inventoryQuery.data ?? [];
  const byGridSlot = new Map<number, InventoryItemDto>();
  for (const item of items) {
    if (!item.equippedSlot && item.activeSlotIndex === null) byGridSlot.set(item.slotIndex!, item);
  }
  const tabItemCounts = Array.from({ length: INVENTORY_TABS }, (_, tab) => {
    let count = 0;
    for (const slotIndex of byGridSlot.keys()) {
      if (Math.floor(slotIndex / GRID_SLOTS) === tab) count += 1;
    }
    return count;
  });

  const selectedTotal = Array.from(selection).reduce((sum, id) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? item.item.sellPrice * item.quantity : 0);
  }, 0);

  const npcs = npcsQuery.data ?? [];
  const activeNpc = npcs.find((n) => n.id === activeNpcId) ?? npcs[0] ?? null;

  return (
    <DndContext sensors={sensors} onDragEnd={() => {}}>
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelFrame
          title="Twój ekwipunek"
          headerRight={
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelection(new Set());
              }}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                selectMode
                  ? "border-gold bg-gold/10 text-gold-bright"
                  : "border-line-soft text-parchment-dim hover:bg-panel-raised"
              }`}
            >
              {selectMode ? "Anuluj zaznaczanie" : "Zaznacz do sprzedaży"}
            </button>
          }
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-parchment-faint">
              {selectMode
                ? "Klikaj przedmioty z wartością sprzedaży, żeby je zaznaczyć."
                : "Prawy klik: sprzedaj / usuń / otwórz."}
            </p>
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

          <div className="mt-3 grid grid-cols-[repeat(5,3.5rem)] gap-2">
            {layoutGridTab(byGridSlot, activeTab * GRID_SLOTS).map((cell) => (
              <GridSlot key={cell.slotIndex} slotIndex={cell.slotIndex} height={cell.height}>
                {cell.item && (
                  <ItemBox
                    inventoryItem={cell.item}
                    tall={cell.height === 2}
                    selected={selectMode && selection.has(cell.item.id)}
                    onSelect={() => (selectMode ? toggleSelected(cell.item!) : undefined)}
                    onContextMenu={handleItemContextMenu}
                  />
                )}
              </GridSlot>
            ))}
          </div>

          {selection.size > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-gold/40 bg-gold/5 px-3 py-2">
              <span className="text-sm text-parchment">
                Zaznaczono {selection.size} — razem ~{selectedTotal} złota
              </span>
              <button
                onClick={sellSelection}
                disabled={bulkSelling}
                className="rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-ink hover:bg-gold-bright disabled:opacity-50"
              >
                {bulkSelling ? "Sprzedaję…" : "Sprzedaj zaznaczone"}
              </button>
            </div>
          )}

          {actionError && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {actionError}
            </p>
          )}
          {actionMessage && (
            <p role="status" className="mt-3 text-sm text-rarity-uncommon">
              {actionMessage}
            </p>
          )}
        </PanelFrame>

        <PanelFrame title="Handel">
          {npcs.length === 0 && (
            <p className="mt-3 text-sm text-parchment-faint">W tym mieście nie ma jeszcze żadnych NPC.</p>
          )}

          {npcs.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {npcs.map((npc) => (
                <button
                  key={npc.id}
                  onClick={() => setActiveNpcId(npc.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    activeNpc?.id === npc.id
                      ? "border-gold bg-gold/10 text-gold-bright"
                      : "border-line-soft text-parchment-dim hover:bg-panel-raised"
                  }`}
                >
                  {npc.name}
                </button>
              ))}
            </div>
          )}

          {activeNpc && (
            <div className="mt-4">
              {npcs.length === 1 && <p className="mb-2 text-sm font-semibold text-parchment">{activeNpc.name}</p>}
              {activeNpc.shopItems.length === 0 ? (
                <p className="text-xs text-parchment-faint">Brak towaru.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-2">
                  {activeNpc.shopItems.map((entry) => {
                    const fullItem = itemFor(entry.itemId);
                    const classMismatch = !!fullItem?.classId && fullItem.classId !== character.classId;
                    return (
                      <ShopItemBox
                        key={entry.id}
                        entry={entry}
                        fullItem={fullItem}
                        restrictedToClassName={fullItem?.classId ? classNameFor(fullItem.classId) : null}
                        classMismatch={classMismatch}
                        onSelect={() => setBuyTarget(entry)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </PanelFrame>
      </div>

      {contextMenu && (
        <ItemContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpen={(id) => openChestMutation.mutate(id)}
          onSell={(id) => sellMutation.mutate(id)}
          onDiscard={(id) => discardMutation.mutate(id)}
        />
      )}

      {buyTarget && (
        <BuyItemModal
          itemName={buyTarget.item.name}
          goldPrice={buyTarget.goldPrice}
          stock={buyTarget.stock}
          stackable={itemFor(buyTarget.itemId)?.stackable ?? false}
          gold={character.gold}
          onConfirm={(quantity) => buyMutation.mutate({ npcShopItemId: buyTarget.id, quantity })}
          onCancel={() => setBuyTarget(null)}
        />
      )}
    </DndContext>
  );
}
