import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import type { StatKey } from "@mmo/shared";
import { STAT_LABELS, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";

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
  children,
}: {
  name: string;
  upgradeLevel: number;
  type: string;
  minLevel: number;
  /** Class restriction display name, or null when the item is usable by any class. */
  className: string | null;
  stats: Partial<Record<StatKey, number>>;
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

  const statEntries = Object.entries(stats).filter(([, v]) => v) as [StatKey, number][];

  return (
    <div onMouseEnter={reveal} onMouseLeave={() => setPosition(null)} onFocus={reveal} onBlur={() => setPosition(null)}>
      {children}
      {position && (
        <div
          style={{ left: position.left, top: position.top, bottom: position.bottom }}
          className="pointer-events-none fixed z-50 w-56 border border-gold/25 bg-[oklch(23%_0.006_45_/_0.88)] p-3 text-center text-xs shadow-lg backdrop-blur-sm"
        >
          <p className="font-display text-sm font-semibold text-gold-bright">
            {name}
            {upgradeLevel > 0 && <span> +{upgradeLevel}</span>}
          </p>
          <p className="mt-1 text-parchment-faint">{TYPE_LABELS[type] ?? type}</p>
          <p className="text-parchment-faint">{itemClassName ? `Dla klasy: ${itemClassName}` : "Uniwersalny"}</p>
          <p className="text-parchment-faint">Od poziomu: {minLevel}</p>
          {statEntries.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-gold/20 pt-2">
              {statEntries.map(([stat, value]) => (
                <p key={stat} className="text-parchment-dim">
                  {STAT_LABELS[stat]}: <span className="text-parchment">{formatStatValue(stat, value)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
