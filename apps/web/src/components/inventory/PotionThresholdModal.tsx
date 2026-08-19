import { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Lets the player pick their own "use below X% HP/MP" trigger for one active-slotted potion,
 * instead of always relying on the admin's item-wide default (Item.potionThresholdPct) — see
 * setPotionThresholdOverride in lib/inventoryApi.ts. Only opened for items whose potionTrigger is
 * hp_below/mana_below; interval-triggered potions have no threshold to configure. */
export function PotionThresholdModal({
  itemName,
  trigger,
  currentPct,
  hasOverride,
  onSave,
  onCancel,
}: {
  itemName: string;
  trigger: "hp_below" | "mana_below";
  /** Effective threshold right now (override if set, otherwise the item's own default), 0-1. */
  currentPct: number;
  /** Whether that value is a player override (shows "przywróć domyślny") or the item's default. */
  hasOverride: boolean;
  /** pct is 0-1, or null to clear the override and revert to the item's default. */
  onSave: (pct: number | null) => void;
  onCancel: () => void;
}) {
  const [percent, setPercent] = useState(Math.round(currentPct * 100));
  useEscapeKey(onCancel);

  const statLabel = trigger === "hp_below" ? "HP" : "many";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">Próg użycia</h2>
        <p className="mt-2 text-sm text-parchment-dim">
          <span className="font-medium text-parchment">{itemName}</span> zostanie użyty automatycznie, gdy{" "}
          {statLabel} spadnie poniżej wybranego progu.
        </p>
        <label className="mt-4 block text-sm text-parchment-dim">
          Użyj przy {statLabel} poniżej
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={95}
              step={1}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-14 shrink-0 text-right font-display text-base font-semibold tabular-nums text-gold-bright">
              {percent}%
            </span>
          </div>
        </label>
        <div className="mt-4 flex items-center justify-between gap-2">
          {hasOverride ? (
            <button
              onClick={() => onSave(null)}
              className="text-xs text-parchment-faint underline-offset-2 hover:text-parchment-dim hover:underline"
            >
              Przywróć domyślny
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
            >
              Anuluj
            </button>
            <button
              onClick={() => onSave(percent / 100)}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
            >
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
