import type { CombatEvent } from "@mmo/shared";

/** Walks the (already time-revealed) event list backwards to find the monster currently being
 * fought, and its HP as of the last revealed round — null once that monster is defeated, the
 * fight has ended, or no encounter has started yet. */
function findCurrentMonster(events: CombatEvent[]) {
  let lastStart: Extract<CombatEvent, { type: "encounter_start" }> | null = null;
  let lastStartIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "encounter_start") {
      lastStart = e;
      lastStartIndex = i;
      break;
    }
  }
  if (!lastStart) return null;

  let hp = lastStart.monsterMaxHp;
  for (let i = lastStartIndex + 1; i < events.length; i++) {
    const e = events[i];
    if (e.type === "round") hp = e.monsterHpAfter;
    if (e.type === "encounter_result") return null; // already defeated, next encounter_start not revealed yet
  }
  return { name: lastStart.monsterName, level: lastStart.monsterLevel, maxHp: lastStart.monsterMaxHp, hp };
}

export function MonsterEncounterPanel({ events }: { events: CombatEvent[] }) {
  const monster = findCurrentMonster(events);
  if (!monster) return null;

  const pct = monster.maxHp > 0 ? Math.max(0, Math.min(100, (monster.hp / monster.maxHp) * 100)) : 0;

  return (
    <div className="flex items-center gap-3 border border-line bg-ink/60 p-3">
      {/* Placeholder — real monster art is a future addition */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-soft bg-panel-raised text-parchment-faint">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-parchment">
          {monster.name} <span className="text-xs font-normal text-parchment-faint">(poziom {monster.level})</span>
        </p>
        <div className="mt-1 h-2 w-full overflow-hidden bg-panel-raised">
          <div className="h-full bg-hp transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-0.5 text-xs text-parchment-faint">
          {Math.round(monster.hp)} / {monster.maxHp} HP
        </p>
      </div>
    </div>
  );
}
