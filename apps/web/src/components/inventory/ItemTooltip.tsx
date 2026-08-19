import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import type { StatKey } from "@mmo/shared";
import { STAT_LABELS, STAT_FORMAT, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";

const TOOLTIP_WIDTH = 224; // w-56
const TOOLTIP_GAP = 8;
// Actual height isn't known until render, so the above/below choice below uses a conservative
// estimate (worst case ~8 stat rows) rather than a post-render measurement.
const TOOLTIP_HEIGHT_ESTIMATE = 260;

export function ItemTooltip({
  name,
  upgradeLevel,
  type,
  minLevel,
  className: itemClassName,
  stats,
  compareStats,
  classMismatch = false,
  gatherSuccessCount,
  gatherSuccessRequired,
  children,
}: {
  name: string;
  upgradeLevel: number;
  type: string;
  minLevel: number;
  /** Class restriction display name, or null when the item is usable by any class. */
  className: string | null;
  stats: Partial<Record<StatKey, number>>;
  /** Only for rod/pickaxe — successful gathers with this tool vs. how many are needed to unlock
   * its next anvil upgrade. Provide both together, or neither. */
  gatherSuccessCount?: number;
  gatherSuccessRequired?: number;
  /** Stats of the item currently worn in the same equip slot — when provided, each stat row
   * grows a colored "(+N)"/"(-N)" delta against it. undefined disables the comparison entirely
   * (used outside the equipment doll, where there's no "currently worn" item to diff against). */
  compareStats?: Partial<Record<StatKey, number>>;
  /** True when this item is restricted to a class other than the viewing character's — recolors
   * the whole tooltip red so a mismatch reads at a glance instead of requiring the player to read
   * the class line. */
  classMismatch?: boolean;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  function reveal(e: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, TOOLTIP_GAP),
      window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_GAP,
    );
    if (rect.top >= TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_GAP) {
      setPosition({ left, bottom: window.innerHeight - rect.top + TOOLTIP_GAP });
    } else {
      setPosition({ left, top: rect.bottom + TOOLTIP_GAP });
    }
  }

  // Union with compareStats' keys so losing a stat the currently-worn item has (e.g. a weapon
  // with crit chance vs. a candidate with none) still shows up as a visible "(-N)" instead of
  // silently vanishing from the list.
  const statKeys = (
    compareStats
      ? Array.from(new Set([...Object.keys(stats), ...Object.keys(compareStats)]))
      : Object.keys(stats)
  ).filter((k) => stats[k as StatKey] || compareStats?.[k as StatKey]) as StatKey[];

  return (
    <div onMouseEnter={reveal} onMouseLeave={() => setPosition(null)} onFocus={reveal} onBlur={() => setPosition(null)}>
      {children}
      {position && (
        <div
          style={{ left: position.left, top: position.top, bottom: position.bottom }}
          className={`pointer-events-none fixed z-50 w-56 border p-3 text-center text-xs shadow-lg backdrop-blur-sm ${
            classMismatch ? "border-red-500/50 bg-[oklch(23%_0.03_25_/_0.92)]" : "border-gold/25 bg-[oklch(23%_0.006_45_/_0.88)]"
          }`}
        >
          <p className={`font-display text-sm font-semibold ${classMismatch ? "text-red-400" : "text-gold-bright"}`}>
            {name}
            {upgradeLevel > 0 && <span> +{upgradeLevel}</span>}
          </p>
          <p className="mt-1 text-parchment-faint">{TYPE_LABELS[type] ?? type}</p>
          <p className={classMismatch ? "font-semibold text-red-400" : "text-parchment-faint"}>
            {classMismatch
              ? `Nie dla Twojej klasy (wymaga: ${itemClassName})`
              : itemClassName
                ? `Dla klasy: ${itemClassName}`
                : "Uniwersalny"}
          </p>
          <p className="text-parchment-faint">Od poziomu: {minLevel}</p>
          {gatherSuccessCount !== undefined && gatherSuccessRequired !== undefined && (
            <p className="text-parchment-faint">
              Udane zbiórki: {gatherSuccessCount}/{gatherSuccessRequired}
            </p>
          )}
          {statKeys.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-gold/20 pt-2">
              {statKeys.map((stat) => {
                const value = stats[stat] ?? 0;
                const diff = compareStats ? value - (compareStats[stat] ?? 0) : 0;
                // Gate on the ROUNDED diff, not the raw one — a sub-1 difference (e.g. from a
                // rolled affix) is real but formatStatValue would print it as "+0", which reads
                // as a false "changed" signal next to a value that's visibly identical.
                const roundedDiff = STAT_FORMAT[stat] === "percent" ? Math.round(diff * 100) : Math.round(diff);
                return (
                  <p key={stat} className="text-parchment-dim">
                    {STAT_LABELS[stat]}:{" "}
                    <span className={classMismatch ? "text-red-400" : "text-parchment"}>
                      {formatStatValue(stat, value)}
                    </span>
                    {!classMismatch && compareStats && roundedDiff !== 0 && (
                      <span className={roundedDiff > 0 ? "text-rarity-uncommon" : "text-red-400"}>
                        {" "}
                        ({formatStatValue(stat, diff)})
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
