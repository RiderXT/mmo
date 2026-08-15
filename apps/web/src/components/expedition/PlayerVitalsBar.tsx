import type { CombatEvent } from "@mmo/shared";

/** Walks the (already time-revealed) event list to find the player's current HP/mana as of the
 * last event that touched them — "round" only updates HP (mana regen happens silently inside
 * the simulation and isn't logged per-round), "skill_activated"/"potion_used" update both. */
function findPlayerVitals(events: CombatEvent[], maxHp: number, maxMana: number) {
  let hp = maxHp;
  let mana = maxMana;
  for (const e of events) {
    if (e.type === "round") hp = e.playerHpAfter;
    else if (e.type === "skill_activated" || e.type === "potion_used") {
      hp = e.playerHpAfter;
      mana = e.playerManaAfter;
    } else if (e.type === "character_died") hp = 0;
  }
  return { hp, mana };
}

function VitalBar({ label, value, max, barClassName }: { label: string; value: number; max: number; barClassName: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[11px] tracking-wide text-parchment-faint">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden bg-panel-raised">
        <div className={`h-full transition-all ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-parchment-dim">
        {Math.max(0, Math.round(value))} / {max}
      </span>
    </div>
  );
}

export function PlayerVitalsBar({
  events,
  maxHp,
  maxMana,
}: {
  events: CombatEvent[];
  maxHp: number;
  maxMana: number;
}) {
  const { hp, mana } = findPlayerVitals(events, maxHp, maxMana);
  return (
    <div className="space-y-1.5 border border-line bg-ink/60 p-3">
      <VitalBar label="HP" value={hp} max={maxHp} barClassName="bg-hp" />
      {maxMana > 0 && <VitalBar label="MP" value={mana} max={maxMana} barClassName="bg-mp" />}
    </div>
  );
}
