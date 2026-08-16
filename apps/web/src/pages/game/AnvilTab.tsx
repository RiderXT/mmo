import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, ItemType } from "@mmo/shared";
import { defaultUpgradeSuccessChance } from "@mmo/shared";
import { ItemTypeIcon } from "../../components/inventory/ItemTypeIcon";
import { ApiError } from "../../lib/apiClient";
import { listInventory, upgradeItem, type InventoryItemDto } from "../../lib/inventoryApi";
import { listPlayerItems } from "../../lib/itemsApi";
import type { ItemDto } from "../../lib/adminApi";

const UPGRADABLE_TYPES = new Set<ItemType>(["weapon", "armor", "helmet", "boots", "necklace", "earrings", "ring"]);

export function AnvilTab({ character }: { character: Character }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => listInventory(characterId),
  });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });

  const upgradableItems = (inventoryQuery.data ?? []).filter((inv) => UPGRADABLE_TYPES.has(inv.item.type));
  const itemFor = (itemId: string): ItemDto | undefined => itemsQuery.data?.find((i) => i.id === itemId);

  const ownedQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventoryQuery.data ?? []) {
      map.set(inv.itemId, (map.get(inv.itemId) ?? 0) + inv.quantity);
    }
    return map;
  }, [inventoryQuery.data]);

  const selected = upgradableItems.find((i) => i.id === selectedId) ?? null;
  const selectedCatalogItem = selected ? itemFor(selected.itemId) : undefined;
  const targetLevel = selected ? selected.upgradeLevel + 1 : null;
  const levelConfig = selectedCatalogItem?.upgradeLevelConfigs.find((c) => c.targetLevel === targetLevel);
  const chance = targetLevel !== null ? (levelConfig?.successChance ?? defaultUpgradeSuccessChance(targetLevel)) : null;
  const requirements = selectedCatalogItem?.upgradeRequirements.filter((r) => r.targetLevel === targetLevel) ?? [];
  const hasPath = requirements.length > 0;
  const hasAllMaterials = requirements.every((r) => (ownedQtyByItemId.get(r.requiredItemId) ?? 0) >= r.requiredQty);

  const upgradeMutation = useMutation({
    mutationFn: (inventoryItemId: string) => upgradeItem(characterId, inventoryItemId),
    onSuccess: (result) => {
      setError(null);
      setResultMessage(
        result.success
          ? `Sukces! Przedmiot ulepszony do +${result.newLevel}.`
          : `Porażka — przedmiot pozostał na poziomie +${result.newLevel}, materiały przepadły.`,
      );
      queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
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

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">Kowadło</h2>
        <p className="mt-1 text-xs text-parchment-faint">Wybierz przedmiot do ulepszenia.</p>

        <div className="mt-3 space-y-1.5">
          {upgradableItems.map((inv) => (
            <button
              key={inv.id}
              onClick={() => selectItem(inv.id)}
              className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition ${
                inv.id === selectedId ? "border-gold bg-gold/10" : "border-line hover:border-line-soft"
              }`}
            >
              <ItemTypeIcon type={inv.item.type} className="h-4 w-4 shrink-0 text-parchment-dim" />
              <span className="text-parchment">{inv.item.name}</span>
              {inv.upgradeLevel > 0 && <span className="text-gold-bright">+{inv.upgradeLevel}</span>}
              {inv.equippedSlot && <span className="ml-auto text-xs text-parchment-faint">założony</span>}
            </button>
          ))}
          {upgradableItems.length === 0 && (
            <p className="text-sm text-parchment-faint">Brak przedmiotów, które można ulepszyć.</p>
          )}
        </div>
      </div>

      <div className="panel p-4">
        {!selected ? (
          <p className="text-sm text-parchment-faint">Wybierz przedmiot z listy po lewej.</p>
        ) : (
          <>
            <h2 className="font-medium text-parchment">
              {selected.item.name}
              {selected.upgradeLevel > 0 && <span className="text-gold-bright"> +{selected.upgradeLevel}</span>}
              <span className="ml-2 text-sm text-parchment-dim">→ +{targetLevel}</span>
            </h2>

            {!hasPath ? (
              <p className="mt-3 text-sm text-parchment-faint">
                Brak zdefiniowanej ścieżki ulepszenia dla tego poziomu.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm text-parchment-dim">
                  Szansa powodzenia: <span className="font-medium text-gold-bright">{Math.round((chance ?? 0) * 100)}%</span>
                </p>
                <p className="mt-1 text-xs text-parchment-faint">
                  Przy porażce materiały przepadają, a przedmiot pozostaje bez zmian.
                </p>

                <p className="mt-3 text-xs font-medium text-parchment-dim">Wymagane materiały</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {requirements.map((r) => {
                    const owned = ownedQtyByItemId.get(r.requiredItemId) ?? 0;
                    const ok = owned >= r.requiredQty;
                    return (
                      <li key={r.requiredItemId} className={ok ? "text-parchment-dim" : "text-red-400"}>
                        {r.requiredItem.name}: {owned} / {r.requiredQty}
                      </li>
                    );
                  })}
                </ul>

                <button
                  onClick={() => upgradeMutation.mutate(selected.id)}
                  disabled={upgradeMutation.isPending || !hasAllMaterials}
                  className="mt-4 bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ulepsz
                </button>
              </>
            )}

            {resultMessage && <p className="mt-3 text-sm text-rarity-uncommon">{resultMessage}</p>}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
