import type { CombatEvent } from "@mmo/shared";
import { CombatIcon } from "./CombatIcon";

export interface SkillCooldownInfo {
  name: string;
  cooldownSeconds: number;
}

/** Visual cooldown indicator per active skill — finds the most recent skill_activated event for
 * that skill among the already-revealed events and computes remaining time against `elapsedSeconds`
 * (the same simulated-time clock the rest of ExpeditionPanel ticks on), so it stays in sync with
 * the "reveal by wall-clock" combat log without any extra server state. */
export function ActiveSkillCooldownBar({
  skills,
  events,
  elapsedSeconds,
}: {
  skills: SkillCooldownInfo[];
  events: CombatEvent[];
  elapsedSeconds: number;
}) {
  if (skills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => {
        let lastUsedAt: number | null = null;
        for (let i = events.length - 1; i >= 0; i--) {
          const e = events[i];
          if (e.type === "skill_activated" && e.skillName === skill.name) {
            lastUsedAt = e.t;
            break;
          }
        }
        const remaining =
          lastUsedAt === null ? 0 : Math.max(0, skill.cooldownSeconds - (elapsedSeconds - lastUsedAt));
        const ready = remaining <= 0;
        const fillPct = ready
          ? 100
          : Math.round(((skill.cooldownSeconds - remaining) / skill.cooldownSeconds) * 100);

        return (
          <div key={skill.name} className="flex w-14 flex-col items-center gap-1">
            <div className="relative h-10 w-10 overflow-hidden border border-line-soft bg-ink">
              <div
                className={`absolute inset-x-0 bottom-0 transition-[height] ${ready ? "bg-gold/40" : "bg-panel-raised"}`}
                style={{ height: `${fillPct}%` }}
              />
              <div className="relative flex h-full w-full items-center justify-center text-xs font-medium text-parchment">
                {ready ? <CombatIcon kind="victory" className="h-4 w-4 text-gold-bright" /> : Math.ceil(remaining)}
              </div>
            </div>
            <span className="text-center text-[10px] leading-tight text-parchment-faint">{skill.name}</span>
          </div>
        );
      })}
    </div>
  );
}
