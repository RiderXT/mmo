import type { Character } from "@mmo/shared";
import type { ZoneDto } from "../../lib/adminApi";
import { LockGlyph } from "../character/SkillSygil";
import { CampfireGlyph, WildZoneGlyph } from "./ZoneGlyphs";

/** Left-side "expedition map" — zones laid out as a vertical waypoint path in tier order
 * (`minLevel` ascending), dashed connectors between consecutive stops, matching the visual
 * grammar of the sidebar's circular nav-icon badges (see AppShell.tsx's SectionTitle dot:
 * `rounded-full`, `bg-gradient-to-br from-panel-raised to-panel`, 1px border) rather than a
 * literal illustrated landscape — there's no art pipeline for hand-painted terrain here. */
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

  if (ordered.length === 0) {
    return <p className="text-sm text-parchment-faint">Brak dostępnych krain.</p>;
  }

  return (
    <div className="flex flex-col items-center">
      {ordered.map((zone, i) => {
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
  );
}
