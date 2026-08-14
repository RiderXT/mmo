import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Character, CoreStatKey } from "@mmo/shared";
import { allocateStat } from "../../lib/charactersApi";
import { ApiError } from "../../lib/apiClient";

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["character", character.id] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się przydzielić punktu"),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-100">Statystyki</h2>
        <span className="text-xs text-slate-400">
          Niewydane punkty: <span className="text-amber-300">{character.unspentStatPoints}</span>
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {(Object.keys(STAT_LABELS) as CoreStatKey[]).map((stat) => (
          <div key={stat} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{STAT_LABELS[stat]}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-slate-200">{character[stat]}</span>
              <button
                onClick={() => mutation.mutate(stat)}
                disabled={character.unspentStatPoints < 1 || mutation.isPending}
                className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
