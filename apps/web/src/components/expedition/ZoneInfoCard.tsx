import type { ItemType } from "@mmo/shared";
import type { ZoneDto } from "../../lib/adminApi";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

const MAX_DROPS_SHOWN = 6;

/** Detail card for whichever zone is selected on ZoneMapPath — real data throughout (no
 * fabricated "preparations"/"estimated gold" placeholders): level range, travel time, the
 * zone's actual monster roster, and its actual drop table as a "possible loot" icon strip. */
export function ZoneInfoCard({ zone, eligible }: { zone: ZoneDto; eligible: boolean }) {
  const shownDrops = zone.drops.slice(0, MAX_DROPS_SHOWN);
  const extraDrops = zone.drops.length - shownDrops.length;

  return (
    <div className="w-full border border-line-soft/60 bg-panel-raised/40 p-3">
      <p className="font-display text-sm font-semibold text-gold-bright">{zone.name}</p>
      {zone.description && <p className="mt-1 text-xs text-parchment-faint">{zone.description}</p>}

      <div className="mt-2 space-y-0.5 text-xs text-parchment-dim">
        <p>
          Zalecany poziom: <span className="text-parchment">{zone.minLevel}-{zone.maxLevel}</span>
        </p>
        {!zone.isTown && (
          <p>
            Szacowany czas podróży: <span className="text-parchment">~{zone.travelTimeSeconds}s</span>
          </p>
        )}
      </div>

      {!eligible && (
        <p className="mt-2 text-xs font-medium text-red-400">
          Wymagany poziom {zone.minLevel}-{zone.maxLevel}.
        </p>
      )}

      {zone.monsters.length > 0 && (
        <div className="mt-2 border-t border-line-soft/40 pt-2">
          <p className="text-[11px] uppercase tracking-wide text-parchment-faint">Wrogowie</p>
          <ul className="mt-1 space-y-0.5 text-xs text-parchment-dim">
            {zone.monsters.map((zm) => (
              <li key={zm.id}>
                {zm.monster.name} <span className="text-parchment-faint">(poz. {zm.monster.level})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shownDrops.length > 0 && (
        <div className="mt-2 border-t border-line-soft/40 pt-2">
          <p className="text-[11px] uppercase tracking-wide text-parchment-faint">Możliwe łupy</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {shownDrops.map((d) => (
              <span
                key={d.id}
                title={d.item.name}
                className="flex h-6 w-6 items-center justify-center border border-line-soft/60 bg-panel-raised"
              >
                <ItemTypeIcon type={d.item.type as ItemType} className="h-4 w-4 text-parchment-dim" />
              </span>
            ))}
            {extraDrops > 0 && <span className="text-xs text-parchment-faint">+{extraDrops} więcej</span>}
          </div>
        </div>
      )}
    </div>
  );
}
