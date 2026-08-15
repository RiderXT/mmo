import { useEffect, useRef } from "react";
import type { CombatEvent, ItemType } from "@mmo/shared";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

const EFFECT_LABEL: Record<string, string> = {
  damage: "obrażeń",
  heal: "leczenia",
};

export interface LootItemLookup {
  name: string;
  type: ItemType;
}

function EventLine({
  event,
  itemFor,
}: {
  event: CombatEvent;
  itemFor: (id: string) => LootItemLookup | undefined;
}) {
  switch (event.type) {
    case "encounter_start":
      return (
        <p className="text-parchment-dim">
          ⚔️ Starcie: <span className="text-parchment">{event.monsterName}</span> (poziom{" "}
          {event.monsterLevel}, {event.monsterMaxHp} HP)
        </p>
      );
    case "round":
      // HP/monster HP are shown live via PlayerVitalsBar / MonsterEncounterPanel above the
      // log — this line only narrates what happened this round, not the resulting totals.
      return (
        <>
          <p className="text-emerald-300">
            🗡️ Zadano {event.playerDamage} obrażeń{event.playerCrit ? " (KRYTYK!)" : ""}
          </p>
          <p className={event.monsterEvaded ? "text-sky-300" : "text-red-300"}>
            {event.monsterEvaded ? "🛡️ Unik! Potwór nie trafił." : `💢 Otrzymano ${event.monsterDamage} obrażeń`}
          </p>
        </>
      );
    case "skill_activated":
      return (
        <p className="text-violet-300">
          ✨ {event.skillName}: +{event.power} {EFFECT_LABEL[event.effectType]}
        </p>
      );
    case "encounter_result":
      return (
        <p className="font-medium text-emerald-400">
          ✅ Zwycięstwo nad {event.monsterName}! +{event.expGained} exp, +{event.goldGained} złota
        </p>
      );
    case "loot": {
      const item = itemFor(event.itemId);
      return (
        <p className="flex items-center gap-1.5 text-amber-300">
          <ItemTypeIcon type={item?.type ?? "material"} className="h-4 w-4 shrink-0" />
          Wypadło: {item?.name ?? event.itemId} ×{event.quantity}
        </p>
      );
    }
    case "potion_used":
      return (
        <p className="text-cyan-300">
          🧪 Użyto: {event.itemName} (+{event.amount})
        </p>
      );
    case "character_died":
      return <p className="font-medium text-red-500">☠️ Postać zginęła.</p>;
    case "fight_time_limit_reached":
      return <p className="font-medium text-gold-bright">⏱️ Osiągnięto maksymalny czas walki — postać przetrwała.</p>;
  }
}

export function CombatLog({
  events,
  itemFor,
}: {
  events: CombatEvent[];
  itemFor: (id: string) => LootItemLookup | undefined;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const kills = events.filter((e) => e.type === "encounter_result").length;
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
          <EventLine key={idx} event={event} itemFor={itemFor} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
