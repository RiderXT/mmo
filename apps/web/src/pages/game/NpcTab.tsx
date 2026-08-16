import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, ItemType } from "@mmo/shared";
import { GridSlot } from "../../components/inventory/GridSlot";
import { ItemBox } from "../../components/inventory/ItemBox";
import { ItemContextMenu, type ItemContextMenuTarget } from "../../components/inventory/ItemContextMenu";
import { ItemTypeIcon } from "../../components/inventory/ItemTypeIcon";
import { BuyItemModal } from "../../components/expedition/BuyItemModal";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { listInventory, sellItem, discardItem, openChest, type InventoryItemDto } from "../../lib/inventoryApi";
import { listNpcsForZone, buyFromNpc, type NpcShopItemPublicDto } from "../../lib/npcShopApi";

const GRID_SLOTS = 24;
const INVENTORY_TABS = 4;
const TAB_LABELS = ["I", "II", "III", "IV"];

const ICON_BG: Record<string, string> = {
  weapon: "oklch(45% 0.15 25)",
  armor: "oklch(30% 0.03 250)",
  helmet: "oklch(30% 0.03 250)",
  boots: "oklch(30% 0.03 250)",
  necklace: "oklch(45% 0.1 85)",
  earrings: "oklch(45% 0.1 85)",
  ring: "oklch(45% 0.1 85)",
  consumable: "oklch(45% 0.15 25)",
  material: "oklch(35% 0.02 60)",
  quest: "oklch(45% 0.12 300)",
  chest: "oklch(50% 0.14 145)",
};

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

  const itemFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId);

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
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">NPC</h2>
        <p className="mt-2 text-sm text-parchment-faint">Handel z NPC jest dostępny tylko w mieście.</p>
      </div>
    );
  }

  const items = inventoryQuery.data ?? [];
  const byGridSlot = new Map<number, InventoryItemDto>();
  for (const item of items) {
    if (!item.equippedSlot && item.activeSlotIndex === null) byGridSlot.set(item.slotIndex, item);
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
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-parchment">Twój ekwipunek</h2>
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
          </div>

          <div className="mt-3 flex items-center justify-between">
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

          <div className="mt-3 grid grid-cols-6 gap-2">
            {Array.from({ length: GRID_SLOTS }, (_, slotInTab) => {
              const slotIndex = activeTab * GRID_SLOTS + slotInTab;
              const item = byGridSlot.get(slotIndex);
              return (
                <GridSlot key={slotIndex} slotIndex={slotIndex}>
                  {item && (
                    <ItemBox
                      inventoryItem={item}
                      selected={selectMode && selection.has(item.id)}
                      onSelect={() => (selectMode ? toggleSelected(item) : undefined)}
                      onContextMenu={handleItemContextMenu}
                    />
                  )}
                </GridSlot>
              );
            })}
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

          {actionError && <p className="mt-3 text-sm text-red-400">{actionError}</p>}
          {actionMessage && <p className="mt-3 text-sm text-rarity-uncommon">{actionMessage}</p>}
        </div>

        <div className="panel p-4">
          <h2 className="font-medium text-parchment">Handel</h2>

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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {activeNpc.shopItems.map((entry) => {
                    const outOfStock = entry.stock !== null && entry.stock <= 0;
                    const iconBg = ICON_BG[entry.item.type] ?? "oklch(35% 0.02 60)";
                    return (
                      <button
                        key={entry.id}
                        onClick={() => !outOfStock && setBuyTarget(entry)}
                        disabled={outOfStock}
                        className="flex flex-col items-center gap-2 rounded-xl border border-line-soft bg-panel-raised p-3.5 text-left transition hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-lg border border-line-soft"
                          style={{
                            backgroundImage: `repeating-linear-gradient(45deg, ${iconBg} 0, ${iconBg} 6px, oklch(18% 0.02 45) 6px, oklch(18% 0.02 45) 12px)`,
                          }}
                        >
                          <ItemTypeIcon type={entry.item.type as ItemType} className="h-8 w-8 text-parchment" />
                        </div>
                        <span className="line-clamp-2 text-center text-xs font-medium text-parchment">
                          {entry.item.name}
                        </span>
                        {entry.stock !== null && (
                          <span className="text-[10px] text-parchment-faint">zapas: {entry.stock}</span>
                        )}
                        <span className="flex items-center gap-1 font-display text-sm font-bold text-gold">
                          <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                          {entry.goldPrice}
                        </span>
                        {outOfStock && <span className="text-[10px] text-parchment-faint">Wyprzedane</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
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
