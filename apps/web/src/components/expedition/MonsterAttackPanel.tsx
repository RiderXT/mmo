import { useState } from "react";
import type { ZoneDto } from "../../lib/adminApi";

/** Right-side monster selection — inline replacement for the old MonsterPickerModal (deleted;
 * this was a straight overlay-to-panel port, same selection logic, no "Anuluj" since there's no
 * overlay to dismiss anymore). Only ever rendered by ExpeditionPanel for the character's actual
 * current zone, so no empty/ineligible states to handle here — the caller decides when this is
 * the right thing to show. */
export function MonsterAttackPanel({
  zone,
  durationMinutes,
  onConfirm,
}: {
  zone: ZoneDto;
  durationMinutes: number | null;
  onConfirm: (selectedMonsterIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(monsterId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(monsterId)) next.delete(monsterId);
      else next.add(monsterId);
      return next;
    });
  }

  const allSelected = zone.monsters.length > 0 && selected.size === zone.monsters.length;

  return (
    <div>
      <p className="text-xs font-medium text-parchment-dim">Wybierz potwory do walki</p>
      <p className="mt-1 text-xs text-parchment-faint">
        Zaznacz potwory, z którymi postać ma walczyć — pojedyncze albo wszystkie naraz. Walka
        trwa, aż postać zginie
        {durationMinutes != null ? ` (max. ${durationMinutes} min — zabezpieczenie)` : ""}.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {zone.monsters.map((zm) => {
          const isSelected = selected.has(zm.monster.id);
          return (
            <button
              key={zm.id}
              onClick={() => toggle(zm.monster.id)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                isSelected ? "border-gold bg-gold/10" : "border-line hover:border-line-soft"
              }`}
            >
              <div className="font-medium text-parchment">{zm.monster.name}</div>
              <div className="mt-1 text-parchment-faint">poziom {zm.monster.level}</div>
              <div className="text-parchment-faint">{zm.monster.hp} HP</div>
              <div className="text-parchment-faint">+{zm.monster.expReward} exp</div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setSelected(allSelected ? new Set() : new Set(zone.monsters.map((zm) => zm.monster.id)))}
          className="rounded-md border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised"
        >
          {allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
        </button>
        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0}
          className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Rozpocznij walkę
        </button>
      </div>
    </div>
  );
}
