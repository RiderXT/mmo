import { useQuery } from "@tanstack/react-query";
import { getCombatStats } from "../../lib/charactersApi";
import { PanelFrame } from "../common/PanelFrame";

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
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[11px] tracking-wide text-parchment-faint">{label}</span>
      <div className="relative h-3.5 flex-1 overflow-hidden border border-line-soft bg-ink">
        <div className={`h-full ${barClassName}`} style={{ width: `${pct}%` }} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 10%)",
          }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-parchment-dim">
        {value} / {max}
      </span>
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
    <PanelFrame title="Kondycja">
      <div className="space-y-2">
        <VitalBar label="HP" value={stats.maxHp} max={stats.maxHp} barClassName="bg-hp" />
        <VitalBar label="MP" value={stats.maxMana} max={stats.maxMana} barClassName="bg-mp" />
      </div>
      {stats.movementSpeedPct > 0 && (
        <p className="mt-2 text-xs text-parchment-faint">
          Prędkość ruchu: <span className="text-gold-bright">+{Math.round(stats.movementSpeedPct * 100)}%</span>{" "}
          (skraca podróż do krain)
        </p>
      )}
    </PanelFrame>
  );
}
