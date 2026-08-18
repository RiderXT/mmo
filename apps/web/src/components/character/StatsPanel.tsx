import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Character, CoreStatKey } from "@mmo/shared";
import { allocateStat } from "../../lib/charactersApi";
import { ApiError } from "../../lib/apiClient";
import { PanelFrame } from "../common/PanelFrame";

const STAT_LABELS: Record<CoreStatKey, string> = {
  strength: "Siła",
  vitality: "Witalność",
  dexterity: "Zręczność",
  intelligence: "Inteligencja",
};

export function StatsPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (stat: CoreStatKey) => allocateStat(character.id, stat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["character", character.id] });
      queryClient.invalidateQueries({ queryKey: ["combat-stats", character.id] });
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się przydzielić punktu"),
  });

  return (
    <PanelFrame
      title="Statystyki"
      headerRight={
        <span className="text-xs normal-case tracking-normal text-parchment-dim">
          Niewydane punkty: <span className="text-gold-bright">{character.unspentStatPoints}</span>
        </span>
      }
    >
      <div className="space-y-1">
        {(Object.keys(STAT_LABELS) as CoreStatKey[]).map((stat) => (
          <div key={stat} className="flex items-center justify-between text-sm">
            <span className="text-parchment-dim">{STAT_LABELS[stat]}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-parchment">{character[stat]}</span>
              <button
                onClick={() => mutation.mutate(stat)}
                disabled={character.unspentStatPoints < 1 || mutation.isPending}
                className="flex h-5 w-5 items-center justify-center rounded bg-gold text-xs text-ink hover:bg-gold-bright disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
