import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZoneDto, ItemDto } from "../../lib/adminApi";
import { listNpcsForZone, buyFromNpc } from "../../lib/npcShopApi";
import { ApiError } from "../../lib/apiClient";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

export function NpcShopPanel({
  characterId,
  zone,
  gold,
  itemFor,
}: {
  characterId: string;
  zone: ZoneDto;
  gold: number;
  itemFor: (itemId: string) => ItemDto | undefined;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const npcsQuery = useQuery({ queryKey: ["npc-shop-zone", zone.id], queryFn: () => listNpcsForZone(zone.id) });

  const buyMutation = useMutation({
    mutationFn: (npcShopItemId: string) => buyFromNpc(characterId, npcShopItemId, 1),
    onSuccess: (result) => {
      setError(null);
      setMessage(`Kupiono ${itemFor(result.itemId)?.name ?? result.itemId} za ${result.totalPrice} złota.`);
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
      queryClient.invalidateQueries({ queryKey: ["npc-shop-zone", zone.id] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : "Nie udało się kupić przedmiotu");
    },
  });

  const npcs = npcsQuery.data ?? [];

  return (
    <div className="panel p-4">
      <h2 className="font-medium text-parchment">{zone.name}</h2>
      <p className="mt-1 text-xs text-parchment-faint">
        Miasto — tutaj nie ma potworów. Handluj z NPC albo wyrusz gdzie indziej.
      </p>
      <p className="mt-2 text-sm text-parchment-dim">Twoje złoto: {gold}</p>

      {npcs.length === 0 && (
        <p className="mt-3 text-sm text-parchment-faint">W tym mieście nie ma jeszcze żadnych NPC.</p>
      )}

      <div className="mt-3 space-y-4">
        {npcs.map((npc) => (
          <div key={npc.id} className="border border-line-soft p-3">
            <p className="text-sm font-medium text-parchment">{npc.name}</p>
            {npc.shopItems.length === 0 ? (
              <p className="mt-1 text-xs text-parchment-faint">Brak towaru.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {npc.shopItems.map((entry) => {
                  const outOfStock = entry.stock !== null && entry.stock <= 0;
                  const canAfford = gold >= entry.goldPrice;
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 text-parchment-dim">
                        <ItemTypeIcon type={entry.item.type as ItemDto["type"]} className="h-4 w-4 shrink-0" />
                        {entry.item.name}
                        {entry.stock !== null && (
                          <span className="text-xs text-parchment-faint">(zapas: {entry.stock})</span>
                        )}
                      </span>
                      <button
                        onClick={() => buyMutation.mutate(entry.id)}
                        disabled={buyMutation.isPending || outOfStock || !canAfford}
                        className="border border-gold px-3 py-1 text-xs font-medium text-gold-bright hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {outOfStock ? "Wyprzedane" : `Kup za ${entry.goldPrice}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {message && <p className="mt-2 text-sm text-rarity-uncommon">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
