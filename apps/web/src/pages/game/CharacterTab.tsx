import { useQuery } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { StatsPanel } from "../../components/character/StatsPanel";
import { SkillsPanel } from "../../components/character/SkillsPanel";
import { VitalsPanel } from "../../components/character/VitalsPanel";
import { PanelFrame } from "../../components/common/PanelFrame";
import { getCombatStatsBreakdown } from "../../lib/charactersApi";
import { STAT_LABELS, COMBAT_STAT_TO_STAT_KEY, formatBreakdownValue } from "../../lib/statFormat";

export function CharacterTab({ character }: { character: Character }) {
  const characterId = character.id;

  const breakdownQuery = useQuery({
    queryKey: ["combat-stats-breakdown", characterId],
    queryFn: () => getCombatStatsBreakdown(characterId),
  });

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <VitalsPanel characterId={character.id} />
        <StatsPanel character={character} />
        <SkillsPanel character={character} />
      </div>

      {breakdownQuery.data && (
        <PanelFrame title="Statystyki bojowe — źródło" className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-parchment-dim">
                <tr>
                  <th className="py-1 pr-3">Staty</th>
                  <th className="px-2 py-1 text-right">Baza</th>
                  <th className="px-2 py-1 text-right">Ekwipunek</th>
                  <th className="px-2 py-1 text-right">Umiejętności</th>
                  <th className="py-1 pl-2 text-right">Razem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(Object.keys(COMBAT_STAT_TO_STAT_KEY) as (keyof typeof COMBAT_STAT_TO_STAT_KEY)[]).map((key) => {
                  const c = breakdownQuery.data[key];
                  return (
                    <tr key={key}>
                      <td className="py-1 pr-3 text-parchment-dim">{STAT_LABELS[COMBAT_STAT_TO_STAT_KEY[key]]}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.base)}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.equipment)}</td>
                      <td className="px-2 py-1 text-right text-parchment-dim">{formatBreakdownValue(key, c.passive)}</td>
                      <td className="py-1 pl-2 text-right font-medium text-parchment">{formatBreakdownValue(key, c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PanelFrame>
      )}
    </div>
  );
}
