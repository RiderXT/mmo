import { useEffect, useRef } from "react";
import type { LobbyCombatEvent, SkillEffectType } from "@mmo/shared";
import { CombatIcon, type CombatIconKind } from "./CombatIcon";

// Same effect-text mapping as CombatLog.tsx (SKILL_EFFECT_DETAILS) — duplicated rather than
// imported/shared, since this file otherwise has no dependency on CombatLog and the two event
// schemas (CombatEvent vs LobbyCombatEvent) are intentionally separate (see lobbyCombatEvent.ts).
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

function LogLine({ children, tone, icon }: { children: React.ReactNode; tone: string; icon: CombatIconKind }) {
  return (
    <div className="border-b border-line/60 px-3 py-2 last:border-b-0">
      <p className={`flex items-start gap-1.5 text-[13px] font-medium leading-snug ${tone}`}>
        <CombatIcon kind={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{children}</span>
      </p>
    </div>
  );
}

/** Single unified log for a Lobby's group fight — deliberately simpler than solo's split
 * player/enemy CombatLog (two columns stop making sense once several monster slots and several
 * characters are all fighting at once): one chronological feed, each line prefixed with the
 * acting character's name so it's clear who did what. Not a generalization of CombatLog.tsx —
 * LobbyCombatEvent's shape genuinely differs (e.g. encounter_result carries a per-member
 * `rewards[]` instead of one expGained/goldGained), so this is its own renderer. */
export function LobbyCombatLog({
  events,
  characterNameById,
  viewingCharacterId,
}: {
  events: LobbyCombatEvent[];
  characterNameById: Map<string, string>;
  viewingCharacterId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const nameFor = (id: string) => characterNameById.get(id) ?? "?";
  const roundNumbersBySlot = new Map<LobbyCombatEvent, number>();
  const roundCounterBySlot = new Map<number, number>();
  for (const e of events) {
    if (e.type === "round") {
      const next = (roundCounterBySlot.get(e.monsterSlotIndex) ?? 0) + 1;
      roundCounterBySlot.set(e.monsterSlotIndex, next);
      roundNumbersBySlot.set(e, next);
    }
  }

  const lines = events
    .map((event, idx) => {
      switch (event.type) {
        case "encounter_start":
          return (
            <LogLine key={idx} tone="text-parchment-dim" icon="target">
              Starcie #{event.monsterSlotIndex + 1}: <span className="text-parchment">{event.monsterName}</span>{" "}
              (poziom {event.monsterLevel}, {event.monsterMaxHp} HP)
            </LogLine>
          );
        case "round": {
          const isMe = event.actorCharacterId === viewingCharacterId;
          const roundNo = roundNumbersBySlot.get(event);
          const enemyPart = event.monsterStunned
            ? "Przeciwnik ogłuszony — nie zaatakował."
            : event.monsterEvaded
              ? "Przeciwnik unik — nie trafił."
              : event.monsterBlocked
                ? "Zablokowano cios przeciwnika!"
                : `otrzymał ${event.monsterDamage} obrażeń${event.reflectedDamage ? ` (odbito ${event.reflectedDamage})` : ""}`;
          return (
            <LogLine key={idx} tone={isMe ? "text-parchment" : "text-parchment-dim"} icon="attack">
              [Slot {event.monsterSlotIndex + 1}] {nameFor(event.actorCharacterId)}: zadał{" "}
              {event.playerDamage} obrażeń{event.playerCrit ? " (KRYTYK!)" : ""}, {enemyPart}
              <span className="mt-0.5 block text-[11px] font-normal text-parchment-faint">
                runda {roundNo} · HP {nameFor(event.actorCharacterId)}: {event.playerHpAfter} · wróg HP{" "}
                {event.monsterHpAfter}
              </span>
            </LogLine>
          );
        }
        case "skill_activated": {
          const detail = SKILL_EFFECT_DETAILS[event.effectType];
          return (
            <LogLine key={idx} tone="text-violet-300" icon="skill">
              {nameFor(event.actorCharacterId)} — {event.skillName}: {detail.text(event.power, event.success)}
            </LogLine>
          );
        }
        case "potion_used":
          return (
            <LogLine key={idx} tone="text-cyan-300" icon="potion">
              {nameFor(event.actorCharacterId)} użył: {event.itemName} (+{event.amount})
            </LogLine>
          );
        case "encounter_result":
          return (
            <LogLine key={idx} tone="text-emerald-400" icon="victory">
              Zwycięstwo nad {event.monsterName}!{" "}
              {event.rewards.map((r) => `${nameFor(r.characterId)} +${r.expGained} exp/+${r.goldGained} złota`).join(", ")}
            </LogLine>
          );
        case "loot":
          return (
            <LogLine key={idx} tone="text-gold-bright" icon="victory">
              {nameFor(event.actorCharacterId)} zdobył łup ×{event.quantity}
            </LogLine>
          );
        case "character_died":
          return (
            <LogLine key={idx} tone="text-red-500" icon="defeat">
              {nameFor(event.actorCharacterId)} zginął.
            </LogLine>
          );
        case "lobby_wiped":
          return (
            <LogLine key={idx} tone="text-red-500" icon="defeat">
              Cała grupa poległa — walka zakończona.
            </LogLine>
          );
        case "fight_time_limit_reached":
          return (
            <LogLine key={idx} tone="text-gold-bright" icon="time">
              Osiągnięto maksymalny czas walki.
            </LogLine>
          );
        default:
          return null;
      }
    })
    .filter(Boolean);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-parchment-dim">
        Dziennik walki grupowej
      </div>
      <div className="h-64 overflow-y-auto bg-ink/40">
        {lines.length === 0 && <p className="px-3 py-3 text-xs text-parchment-faint">Walka się rozpoczyna…</p>}
        {lines}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
