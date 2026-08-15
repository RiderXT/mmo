import { useState } from "react";
import type { ZoneDto } from "../../lib/adminApi";

export function MonsterPickerModal({
  zone,
  durationMinutes,
  onConfirm,
  onCancel,
}: {
  zone: ZoneDto;
  durationMinutes: number | null;
  onConfirm: (selectedMonsterIds: string[]) => void;
  onCancel: () => void;
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
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto panel p-4">
        <h2 className="font-medium text-parchment">Wybierz potwory do walki</h2>
        <p className="mt-1 text-xs text-parchment-faint">
          Zaznacz potwory, z którymi postać ma walczyć — pojedyncze albo wszystkie naraz.
          {" "}Walka trwa, aż postać zginie{durationMinutes != null ? ` (max. ${durationMinutes} min — zabezpieczenie)` : ""}.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {zone.monsters.map((zm) => {
            const isSelected = selected.has(zm.monster.id);
            return (
              <button
                key={zm.id}
                onClick={() => toggle(zm.monster.id)}
                className={`border px-3 py-2 text-left text-xs transition ${
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
          {zone.monsters.length === 0 && (
            <p className="col-span-full text-sm text-parchment-faint">Ta kraina nie ma jeszcze potworów.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setSelected(allSelected ? new Set() : new Set(zone.monsters.map((zm) => zm.monster.id)))}
            className=" border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised"
          >
            {allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className=" border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
            >
              Anuluj
            </button>
            <button
              onClick={() => onConfirm(Array.from(selected))}
              disabled={selected.size === 0}
              className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
            >
              Rozpocznij walkę
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
