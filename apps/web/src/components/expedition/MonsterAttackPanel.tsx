import { useState } from "react";
import type { ZoneDto } from "../../lib/adminApi";
import { API_URL } from "../../lib/apiClient";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

/** Plain-line "sack" glyph for the drop-info hover trigger — same inline-SVG grammar as
 * ItemTypeIcon/ZoneGlyphs (24x24 viewBox, currentColor stroke, no fill). */
function DropGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 4 H15 L16.5 8 H7.5 Z" />
      <path d="M7.5 8 C5 11 4.5 14 4.5 15.5 C4.5 18.5 7.5 20.5 12 20.5 C16.5 20.5 19.5 18.5 19.5 15.5 C19.5 14 19 11 16.5 8" />
    </svg>
  );
}

/** Hover-only popup (no click needed) listing a monster's possible drops as item art — falls
 * back to the generic ItemTypeIcon placeholder for items without uploaded artwork yet, same
 * convention as SkillsPanel/ItemsAdminPage. Named group (`group/drop`) so it doesn't fight the
 * row's own hover styling. */
function DropInfoTrigger({ drops }: { drops: ZoneDto["monsters"][number]["monster"]["drops"] }) {
  return (
    <span className="group/drop relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <DropGlyph className="h-4 w-4 text-parchment-faint transition group-hover/drop:text-gold-bright" />
      <div className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-56 rounded-md border border-line-soft bg-panel p-2.5 opacity-0 shadow-lg transition group-hover/drop:pointer-events-auto group-hover/drop:opacity-100">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-parchment-faint">Możliwe łupy</p>
        {drops.length === 0 ? (
          <p className="text-xs text-parchment-faint">Ten potwór nie ma zdefiniowanych łupów.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {drops.map((d) => (
              <span
                key={d.id}
                title={d.item.name}
                className="flex h-9 w-9 items-center justify-center border border-line-soft/60 bg-panel-raised"
              >
                {d.item.imageUrl ? (
                  <img src={`${API_URL}${d.item.imageUrl}`} alt="" className="h-full w-full object-contain" />
                ) : (
                  <ItemTypeIcon type={d.item.type} className="h-5 w-5 text-parchment-dim" />
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </span>
  );
}

/** Right-side monster selection — inline replacement for the old MonsterPickerModal (deleted;
 * this was a straight overlay-to-panel port, same selection logic, no "Anuluj" since there's no
 * overlay to dismiss anymore). Only ever rendered by ExpeditionPanel for the character's actual
 * current zone, so no empty/ineligible states to handle here — the caller decides when this is
 * the right thing to show. */
export function MonsterAttackPanel({
  zone,
  durationMinutes,
  onConfirm,
  confirmLabel = "Rozpocznij walkę",
}: {
  zone: ZoneDto;
  durationMinutes: number | null;
  onConfirm: (selectedMonsterIds: string[]) => void;
  confirmLabel?: string;
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

      <div className="mt-3 flex flex-col gap-1.5">
        {zone.monsters.map((zm) => {
          const isSelected = selected.has(zm.monster.id);
          return (
            <button
              key={zm.id}
              onClick={() => toggle(zm.monster.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition ${
                isSelected ? "border-gold bg-gold/10" : "border-line hover:border-line-soft"
              }`}
            >
              <span className="flex-1 truncate">
                <span className="font-medium text-parchment">{zm.monster.name}</span>{" "}
                <span className="text-parchment-faint">
                  {zm.monster.level} lvl, {zm.monster.hp} HP, {zm.monster.expReward} exp
                </span>
              </span>
              <DropInfoTrigger drops={zm.monster.drops} />
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
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
