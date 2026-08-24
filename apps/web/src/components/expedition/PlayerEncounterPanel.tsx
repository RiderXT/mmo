import type { CombatEvent } from "@mmo/shared";
import { findPlayerVitals } from "./PlayerVitalsBar";

/** Player-side twin of MonsterEncounterPanel — same outer box (avatar placeholder + name + bar),
 * so the two sit at identical width/height in a side-by-side grid instead of the player's HP/MP
 * looking like an afterthought next to the monster's fuller card. */
export function PlayerEncounterPanel({
  name,
  level,
  events,
  maxHp,
  maxMana,
}: {
  name: string;
  level: number;
  events: CombatEvent[];
  maxHp: number;
  maxMana: number;
}) {
  const { hp, mana } = findPlayerVitals(events, maxHp, maxMana);
  const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const manaPct = maxMana > 0 ? Math.max(0, Math.min(100, (mana / maxMana) * 100)) : 0;

  return (
    <div className="flex items-center gap-3 border border-line bg-ink/60 p-3">
      {/* Placeholder — real player portraits are a future addition, see MonsterEncounterPanel */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-soft bg-panel-raised text-parchment-faint">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-parchment">
          {name} <span className="text-xs font-normal text-parchment-faint">(poziom {level})</span>
        </p>
        <div className="mt-1 h-2 w-full overflow-hidden bg-panel-raised">
          <div className="h-full bg-hp transition-all" style={{ width: `${hpPct}%` }} />
        </div>
        <p className="mt-0.5 text-xs text-parchment-faint">
          {Math.max(0, Math.round(hp))} / {maxHp} HP
        </p>
        {maxMana > 0 && (
          <>
            <div className="mt-1.5 h-2 w-full overflow-hidden bg-panel-raised">
              <div className="h-full bg-mp transition-all" style={{ width: `${manaPct}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-parchment-faint">
              {Math.max(0, Math.round(mana))} / {maxMana} MP
            </p>
          </>
        )}
      </div>
    </div>
  );
}
