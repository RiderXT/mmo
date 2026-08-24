import { useState } from "react";
import type { BattleTacticsInput } from "@mmo/shared";
import type { ClassSkillDto } from "../../lib/adminApi";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export function BattleTacticsModal({
  activeSkills,
  onConfirm,
  onBack,
}: {
  activeSkills: ClassSkillDto[];
  onConfirm: (tactics: BattleTacticsInput) => void;
  onBack: () => void;
}) {
  const [useHpThresholdOverride, setUseHpThresholdOverride] = useState(false);
  const [hpThresholdPct, setHpThresholdPct] = useState(60);
  const [useManaThresholdOverride, setUseManaThresholdOverride] = useState(false);
  const [manaThresholdPct, setManaThresholdPct] = useState(60);
  const [disabledSkillIds, setDisabledSkillIds] = useState<Set<string>>(new Set());
  useEscapeKey(onBack);

  function toggleSkill(id: string) {
    setDisabledSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    onConfirm({
      hpThresholdOverridePct: useHpThresholdOverride ? hpThresholdPct / 100 : undefined,
      manaThresholdOverridePct: useManaThresholdOverride ? manaThresholdPct / 100 : undefined,
      disabledSkillIds: Array.from(disabledSkillIds),
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onBack} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto panel p-4">
        <h2 className="font-medium text-parchment">Taktyka na tę walkę</h2>
        <p className="mt-1 text-xs text-parchment-faint">
          Nadpisuje tylko na czas tej walki — bazowa konfiguracja mikstur w Itemach się nie zmienia.
        </p>

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-parchment-dim">
            <input
              type="checkbox"
              checked={useHpThresholdOverride}
              onChange={(e) => setUseHpThresholdOverride(e.target.checked)}
              className="accent-gold"
            />
            Nadpisz próg % HP, przy którym mikstury lecznicze się uruchamiają
          </label>
          {useHpThresholdOverride && (
            <div className="flex items-center gap-3 pl-6">
              <input
                type="range"
                min={0}
                max={100}
                value={hpThresholdPct}
                onChange={(e) => setHpThresholdPct(Number(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="w-12 text-right text-sm tabular-nums text-parchment">{hpThresholdPct}%</span>
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-parchment-dim">
            <input
              type="checkbox"
              checked={useManaThresholdOverride}
              onChange={(e) => setUseManaThresholdOverride(e.target.checked)}
              className="accent-gold"
            />
            Nadpisz próg % many, przy którym mikstury many się uruchamiają
          </label>
          {useManaThresholdOverride && (
            <div className="flex items-center gap-3 pl-6">
              <input
                type="range"
                min={0}
                max={100}
                value={manaThresholdPct}
                onChange={(e) => setManaThresholdPct(Number(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="w-12 text-right text-sm tabular-nums text-parchment">{manaThresholdPct}%</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-parchment-dim">
            Aktywne umiejętności do użycia w tej walce
          </p>
          {activeSkills.length === 0 ? (
            <p className="text-sm text-parchment-faint">Brak wykupionych aktywnych umiejętności.</p>
          ) : (
            <div className="space-y-1.5">
              {activeSkills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 text-sm text-parchment-dim">
                  <input
                    type="checkbox"
                    checked={!disabledSkillIds.has(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                    className="accent-gold"
                  />
                  {skill.name}
                  <span className="text-xs text-parchment-faint">(cd {skill.cooldownSeconds}s)</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onBack}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Wstecz
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
          >
            Rozpocznij walkę
          </button>
        </div>
      </div>
    </div>
  );
}
