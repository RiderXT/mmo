import { useState } from "react";
import type { Character } from "@mmo/shared";
import type { ZoneDto } from "../../lib/adminApi";
import { LockGlyph } from "../character/SkillSygil";
import { CampfireGlyph, WildZoneGlyph } from "./ZoneGlyphs";

// Groups the (potentially long) zone chain into level-range tabs so the vertical path doesn't
// grow forever as more tiers are added — bucketed dynamically off the actual seeded zone levels
// (not a hardcoded zone count) so this keeps working as zones are added/removed in admin.
const BAND_SIZE = 30;

/** Left-side "expedition map" — zones laid out as a vertical waypoint path in tier order
 * (`minLevel` ascending), split into level-range tabs (e.g. "1-30") above the path, dashed
 * connectors between consecutive stops within the active tab, matching the visual grammar of
 * the sidebar's circular nav-icon badges (see AppShell.tsx's SectionTitle dot: `rounded-full`,
 * `bg-gradient-to-br from-panel-raised to-panel`, 1px border) rather than a literal illustrated
 * landscape — there's no art pipeline for hand-painted terrain here. */
export function ZoneMapPath({
  zones,
  character,
  selectedZoneId,
  onSelect,
}: {
  zones: ZoneDto[];
  character: Character;
  selectedZoneId: string | null;
  onSelect: (zoneId: string) => void;
}) {
  const ordered = [...zones].sort((a, b) => a.minLevel - b.minLevel);
  const maxLevel = ordered.length > 0 ? Math.max(...ordered.map((z) => z.maxLevel)) : 0;
  const bandCount = Math.max(1, Math.ceil(maxLevel / BAND_SIZE));
  const bands = Array.from({ length: bandCount }, (_, i) => ({
    start: i * BAND_SIZE + 1,
    end: (i + 1) * BAND_SIZE,
  }));
  const currentZone = ordered.find((z) => z.id === character.currentZoneId);
  const defaultBand = currentZone ? Math.min(Math.floor((currentZone.minLevel - 1) / BAND_SIZE), bandCount - 1) : 0;
  const [activeBand, setActiveBand] = useState(defaultBand);
  const band = bands[activeBand] ?? bands[0];
  const visible = ordered.filter((z) => z.minLevel >= band.start && z.minLevel <= band.end);

  if (ordered.length === 0) {
    return <p className="text-sm text-parchment-faint">Brak dostępnych krain.</p>;
  }

  return (
    <div>
      {bandCount > 1 && (
        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
          {bands.map((b, i) => (
            <button
              key={i}
              onClick={() => setActiveBand(i)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeBand === i
                  ? "border-gold bg-gold/10 text-gold-bright"
                  : "border-line-soft text-parchment-dim hover:bg-panel-raised"
              }`}
            >
              {b.start}-{b.end}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col items-center">
        {visible.length === 0 && <p className="text-sm text-parchment-faint">Brak krain w tym przedziale.</p>}
        {visible.map((zone, i) => {
        const eligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
        const isCurrent = zone.id === character.currentZoneId;
        const isSelected = zone.id === selectedZoneId;
        return (
          <div key={zone.id} className="flex flex-col items-center">
            {i > 0 && <div className="h-6 w-px border-l border-dashed border-line-soft" />}
            <button
              onClick={() => eligible && onSelect(zone.id)}
              disabled={!eligible}
              title={eligible ? zone.name : `${zone.name} — wymagany poziom ${zone.minLevel}-${zone.maxLevel}`}
              className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border bg-gradient-to-br from-panel-raised to-panel transition ${
                !eligible
                  ? "cursor-not-allowed border-line-soft opacity-50"
                  : isCurrent
                    ? "border-gold-bright shadow-[0_0_14px_oklch(80%_0.14_85_/_0.45)]"
                    : isSelected
                      ? "border-gold ring-2 ring-gold/50"
                      : "border-line-soft hover:border-gold/60"
              }`}
            >
              {!eligible ? (
                <LockGlyph className="h-6 w-6 text-parchment-faint" />
              ) : zone.isTown ? (
                <CampfireGlyph className="h-6 w-6 text-gold-bright" />
              ) : (
                <WildZoneGlyph className="h-6 w-6 text-parchment-dim" />
              )}
            </button>
            <div className="mb-4 mt-1 max-w-[6.5rem] text-center">
              <p className={`text-xs font-medium ${isSelected ? "text-gold-bright" : "text-parchment-dim"}`}>
                {zone.name}
              </p>
              {isCurrent && <p className="text-[10px] uppercase tracking-wide text-gold">Tu jesteś</p>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
