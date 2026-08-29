import { useEffect, useRef } from "react";
import type { CombatEvent, ItemType, SkillEffectType } from "@mmo/shared";
import { CombatIcon, type CombatIconKind } from "./CombatIcon";

// Mirrors the effect semantics implemented in apps/api/.../expeditions/combat.ts: buff-style
// effects report `power` as a percentage, proc-style effects (stun/poison) report whether the
// one-shot chance succeeded instead.
const SKILL_EFFECT_DETAILS: Record<SkillEffectType, { text: (power: number, success?: boolean) => string }> = {
  damage: { text: (power) => `+${power} obrażeń` },
  heal: { text: (power) => `+${power} leczenia` },
  attack_speed: { text: (power) => `+${power}% szybkości ataku` },
  defense: { text: (power) => `+${power}% obrony` },
  crit: { text: (power) => `+${power}% szansy na krytyk` },
  block_chance: { text: (power) => `+${power}% szansy na blok` },
  reflect: { text: (power) => `+${power}% szansy na odbicie ciosu` },
  stun: { text: (_power, success) => (success ? "Ogłuszono przeciwnika!" : "Próba ogłuszenia nieudana") },
  poison: { text: (_power, success) => (success ? "Zatruto przeciwnika!" : "Próba zatrucia nieudana") },
};

export interface LootItemLookup {
  name: string;
  type: ItemType;
}

function LogLine({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: string;
  icon: CombatIconKind;
}) {
  return (
    <div className="border-b border-line/60 px-3 py-2 last:border-b-0">
      <p className={`flex items-start gap-1.5 text-[13px] font-medium leading-snug ${tone}`}>
        <CombatIcon kind={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{children}</span>
      </p>
    </div>
  );
}

function PlayerLine({ event, roundNo }: { event: CombatEvent; roundNo?: number }) {
  switch (event.type) {
    case "round":
      return (
        <LogLine tone="text-parchment" icon="attack">
          Runda {roundNo}{" "}
          <span className="font-normal text-emerald-300">
            zadano {event.playerDamage} obrażeń{event.playerCrit ? " (KRYTYK!)" : ""}
          </span>
          <span className="mt-0.5 block text-[11px] font-normal text-parchment-faint">HP {event.playerHpAfter}</span>
        </LogLine>
      );
    case "skill_activated": {
      const detail = SKILL_EFFECT_DETAILS[event.effectType];
      return (
        <LogLine tone="text-violet-300" icon="skill">
          {event.skillName}: {detail.text(event.power, event.success)}
        </LogLine>
      );
    }
    case "potion_used":
      return (
        <LogLine tone="text-cyan-300" icon="potion">
          Użyto: {event.itemName} (+{event.amount})
        </LogLine>
      );
    case "encounter_result":
      return (
        <LogLine tone="text-emerald-400" icon="victory">
          Zwycięstwo nad {event.monsterName}! +{event.expGained} exp, +{event.goldGained} złota
        </LogLine>
      );
    case "character_died":
      return (
        <LogLine tone="text-red-500" icon="defeat">
          Postać zginęła.
        </LogLine>
      );
    case "fight_time_limit_reached":
      return (
        <LogLine tone="text-gold-bright" icon="time">
          Osiągnięto maksymalny czas walki — postać przetrwała.
        </LogLine>
      );
    default:
      return null;
  }
}

function EnemyLine({ event, roundNo }: { event: CombatEvent; roundNo?: number }) {
  switch (event.type) {
    case "encounter_start":
      return (
        <LogLine tone="text-parchment-dim" icon="target">
          Starcie: <span className="text-parchment">{event.monsterName}</span> (poziom {event.monsterLevel},{" "}
          {event.monsterMaxHp} HP)
        </LogLine>
      );
    case "round": {
      const negated = event.monsterStunned || event.monsterEvaded || event.monsterBlocked;
      const icon: CombatIconKind = event.monsterStunned
        ? "stun"
        : event.monsterEvaded || event.monsterBlocked
          ? "evade"
          : "impact";
      const text = event.monsterStunned
        ? "Ogłuszony — nie zaatakował."
        : event.monsterEvaded
          ? "Unik! Potwór nie trafił."
          : event.monsterBlocked
            ? "Zablokowano cios!"
            : `Otrzymano ${event.monsterDamage} obrażeń${event.reflectedDamage ? ` (odbito ${event.reflectedDamage})` : ""}`;
      return (
        <LogLine tone={negated ? "text-sky-300" : "text-red-300"} icon={icon}>
          #{roundNo} {text}
          <span className="mt-0.5 block text-[11px] font-normal text-parchment-faint">wróg HP {event.monsterHpAfter}</span>
        </LogLine>
      );
    }
    default:
      return null;
  }
}

export function CombatLog({
  events,
  itemFor,
  showSummary = true,
}: {
  events: CombatEvent[];
  itemFor: (id: string) => LootItemLookup | undefined;
  /** The "Pokonano/Exp/Złoto" line above the log — off when the caller already shows the same
   * running totals elsewhere (e.g. LiveCombatCard's "Wynik ekspedycji" sidebar) so it isn't
   * printed twice on the same screen. */
  showSummary?: boolean;
}) {
  void itemFor; // loot lines render as icons in LootBar (above), not text lines here
  const bottomRefPlayer = useRef<HTMLDivElement>(null);
  const bottomRefEnemy = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRefPlayer.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    bottomRefEnemy.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const kills = events.filter((e) => e.type === "encounter_result").length;
  const exp = events.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.expGained : sum), 0);
  const gold = events.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.goldGained : sum), 0);

  const roundNumbers = new Map<CombatEvent, number>();
  let roundCounter = 0;
  for (const e of events) {
    if (e.type === "round") {
      roundCounter += 1;
      roundNumbers.set(e, roundCounter);
    }
  }

  const playerEvents = events.filter((e) => e.type !== "encounter_start" && e.type !== "loot");
  const enemyEvents = events.filter((e) => e.type === "round" || e.type === "encounter_start");

  return (
    <div className="mt-3">
      {showSummary && (
        <div className="flex flex-wrap gap-3 text-xs text-parchment-dim">
          <span>
            Pokonano: <span className="font-medium text-parchment">{kills}</span>
          </span>
          <span>
            Exp: <span className="font-medium text-parchment">{exp}</span>
          </span>
          <span>
            Złoto: <span className="font-medium text-parchment">{gold}</span>
          </span>
        </div>
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${showSummary ? "mt-2" : ""}`}>
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-parchment-dim">
            Aktywność gracza
          </div>
          <div className="h-48 overflow-y-auto bg-ink/40">
            {playerEvents.length === 0 && <p className="px-3 py-3 text-xs text-parchment-faint">Ekspedycja się rozpoczyna…</p>}
            {playerEvents.map((event, idx) => (
              <PlayerLine key={idx} event={event} roundNo={roundNumbers.get(event)} />
            ))}
            <div ref={bottomRefPlayer} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-parchment-dim">
            Aktywność przeciwnika
          </div>
          <div className="h-48 overflow-y-auto bg-ink/40">
            {enemyEvents.length === 0 && <p className="px-3 py-3 text-xs text-parchment-faint">Brak przeciwnika.</p>}
            {enemyEvents.map((event, idx) => (
              <EnemyLine key={idx} event={event} roundNo={roundNumbers.get(event)} />
            ))}
            <div ref={bottomRefEnemy} />
          </div>
        </div>
      </div>
    </div>
  );
}
