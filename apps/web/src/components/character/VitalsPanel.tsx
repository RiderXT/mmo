import { useQuery } from "@tanstack/react-query";
import { getCombatStats } from "../../lib/charactersApi";

function VitalBar({
  label,
  value,
  max,
  barClassName,
}: {
  label: string;
  value: number;
  max: number;
  barClassName: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {value} / {max}
        </span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function VitalsPanel({ characterId }: { characterId: string }) {
  const statsQuery = useQuery({
    queryKey: ["combat-stats", characterId],
    queryFn: () => getCombatStats(characterId),
  });

  const stats = statsQuery.data;
  if (!stats) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-medium text-slate-100">Kondycja</h2>
      <div className="mt-3 space-y-3">
        <VitalBar label="HP" value={stats.maxHp} max={stats.maxHp} barClassName="bg-red-500" />
        <VitalBar label="MP" value={stats.maxMana} max={stats.maxMana} barClassName="bg-sky-500" />
      </div>
    </div>
  );
}
