import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZoneDto, ItemDto } from "../../lib/adminApi";
import { listNpcsForZone, buyFromNpc } from "../../lib/npcShopApi";
import { ApiError } from "../../lib/apiClient";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-parchment">{zone.name}</h2>
          <p className="mt-1 text-xs text-parchment-faint">
            Miasto — tutaj nie ma potworów. Handluj z NPC albo wyrusz gdzie indziej.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gold">
          <span className="h-3 w-3 rounded-full bg-gold" />
          {gold.toLocaleString("pl-PL")}
        </div>
      </div>

      {npcs.length === 0 && (
        <p className="mt-3 text-sm text-parchment-faint">W tym mieście nie ma jeszcze żadnych NPC.</p>
      )}

      <div className="mt-4 space-y-6">
        {npcs.map((npc) => (
          <div key={npc.id}>
            <p className="mb-2 text-sm font-semibold text-parchment">{npc.name}</p>
            {npc.shopItems.length === 0 ? (
              <p className="text-xs text-parchment-faint">Brak towaru.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {npc.shopItems.map((entry) => {
                  const outOfStock = entry.stock !== null && entry.stock <= 0;
                  const canAfford = gold >= entry.goldPrice;
                  const iconBg = ICON_BG[entry.item.type] ?? "oklch(35% 0.02 60)";
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col items-center gap-2 rounded-xl border border-line-soft bg-panel-raised p-3.5"
                    >
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-lg border border-line-soft"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, ${iconBg} 0, ${iconBg} 6px, oklch(18% 0.02 45) 6px, oklch(18% 0.02 45) 12px)`,
                        }}
                      >
                        <ItemTypeIcon type={entry.item.type as ItemDto["type"]} className="h-8 w-8 text-parchment" />
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
                      <button
                        onClick={() => buyMutation.mutate(entry.id)}
                        disabled={buyMutation.isPending || outOfStock || !canAfford}
                        className="w-full rounded-md bg-gradient-to-b from-gold to-gold py-1.5 text-xs font-bold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {outOfStock ? "Wyprzedane" : "Kup"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {message && <p className="mt-3 text-sm text-rarity-uncommon">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
