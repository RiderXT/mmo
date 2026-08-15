import { useEffect, useRef } from "react";
import type { CombatEvent } from "@mmo/shared";

const EFFECT_LABEL: Record<string, string> = {
  damage: "obrażeń",
  heal: "leczenia",
};

function EventLine({ event, itemNameFor }: { event: CombatEvent; itemNameFor: (id: string) => string }) {
  switch (event.type) {
    case "encounter_start":
      return (
        <p className="text-parchment-dim">
          ⚔️ Starcie: <span className="text-parchment">{event.monsterName}</span> ({event.monsterHp} HP)
        </p>
      );
    case "skill_activated":
      return (
        <p className="text-violet-300">
          ✨ {event.skillName}: +{event.power} {EFFECT_LABEL[event.effectType]}
        </p>
      );
    case "player_attack":
      return (
        <p className="text-emerald-300">
          🗡️ Atak: {event.baseAttack} − obrona {event.monsterDefense}
          {event.skillBonus > 0 ? ` + ${event.skillBonus} (umiejętności)` : ""} = {event.damagePerRound}{" "}
          obrażeń/rundę{event.crit ? " (KRYTYK!)" : ""} × {event.rounds} {event.rounds === 1 ? "runda" : "rundy"}
        </p>
      );
    case "monster_attack":
      return event.evaded ? (
        <p className="text-sky-300">🛡️ Unik! Atak potwora ({event.monsterAttack}) chybił.</p>
      ) : (
        <p className="text-red-300">
          💢 Otrzymano: {event.monsterAttack} − obrona {event.characterDefense} = {event.damagePerRound}{" "}
          obrażeń/rundę × {event.rounds} {event.rounds === 1 ? "runda" : "rundy"}
        </p>
      );
    case "encounter_result":
      return event.won ? (
        <p className="font-medium text-emerald-400">
          ✅ Zwycięstwo nad {event.monsterName}! +{event.expGained} exp, +{event.goldGained} złota
        </p>
      ) : (
        <p className="font-medium text-red-400">☠️ Przegrana z {event.monsterName} — odwrót bez nagrody</p>
      );
    case "loot":
      return (
        <p className="text-amber-300">
          💰 Wypadło: {itemNameFor(event.itemId)} ×{event.quantity}
        </p>
      );
    case "potion_used":
      return (
        <p className="text-cyan-300">
          🧪 Użyto: {event.itemName} ({event.effect})
        </p>
      );
  }
}

export function CombatLog({
  events,
  itemNameFor,
}: {
  events: CombatEvent[];
  itemNameFor: (id: string) => string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const kills = events.filter((e) => e.type === "encounter_result" && e.won).length;
  const exp = events.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.expGained : sum), 0);
  const gold = events.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.goldGained : sum), 0);

  return (
    <div className="mt-3">
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
      <div className="mt-2 h-48 overflow-y-auto  border border-line bg-ink/60 p-2 font-mono text-xs leading-relaxed">
        {events.length === 0 && <p className="text-parchment-faint">Ekspedycja się rozpoczyna…</p>}
        {events.map((event, idx) => (
          <EventLine key={idx} event={event} itemNameFor={itemNameFor} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
