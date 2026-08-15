import type { ReactNode } from "react";
import type { StatKey } from "@mmo/shared";
import { STAT_LABELS, TYPE_LABELS, formatStatValue } from "../../lib/statFormat";

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
  const statEntries = Object.entries(stats).filter(([, v]) => v) as [StatKey, number][];

  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 border border-line-soft bg-panel p-3 text-xs shadow-lg group-hover/tooltip:block">
        <p className="font-medium text-parchment">
          {name}
          {upgradeLevel > 0 && <span className="text-gold-bright"> +{upgradeLevel}</span>}
        </p>
        <p className="mt-0.5 text-parchment-faint">{TYPE_LABELS[type] ?? type}</p>
        <p className="text-parchment-faint">{itemClassName ? `Dla klasy: ${itemClassName}` : "Uniwersalny"}</p>
        <p className="text-parchment-faint">Od poziomu: {minLevel}</p>
        {statEntries.length > 0 && (
          <div className="mt-2 space-y-0.5 border-t border-line pt-2">
            {statEntries.map(([stat, value]) => (
              <p key={stat} className="text-parchment-dim">
                {STAT_LABELS[stat]}: <span className="text-parchment">{formatStatValue(stat, value)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
