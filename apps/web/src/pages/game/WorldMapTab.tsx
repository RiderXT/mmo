import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { listPlayerZones } from "../../lib/zonesApi";
import { ZoneInfoCard } from "../../components/expedition/ZoneInfoCard";
import { CampfireGlyph, WildZoneGlyph } from "../../components/expedition/ZoneGlyphs";
import { PanelFrame } from "../../components/common/PanelFrame";

/** Deterministic scattered pin layout for a variable-length, admin-defined zone list — there's no
 * hand-painted map illustration (same "no art pipeline" situation ZoneMapPath already notes), so
 * pins sweep loosely from bottom-left to top-right in level order with a gentle wave, mirroring
 * the mockup's organic scatter without pretending to know the layout of art that doesn't exist. */
function pinPosition(index: number, total: number) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const left = 10 + t * 78;
  const wave = Math.sin(t * Math.PI * 2.4) * 16;
  const top = 80 - t * 58 + wave;
  return { top: `${Math.min(88, Math.max(8, top))}%`, left: `${left}%` };
}

/** Purely explorational — browse real zone lore/level-ranges/monsters on a map instead of the
 * flat list ZoneMapPath already uses for actually traveling. No travel action here on purpose:
 * this is a new, separate tab (see docs/architecture.md) that may later replace the Ekspedycje
 * map, not a duplicate of its travel/combat flow. */
export function WorldMapTab({ character }: { character: Character }) {
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const ordered = [...(zonesQuery.data ?? [])].sort((a, b) => a.minLevel - b.minLevel);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(character.currentZoneId);
  const selectedZone = ordered.find((z) => z.id === selectedZoneId) ?? null;
  const selectedEligible = selectedZone
    ? character.level >= selectedZone.minLevel && character.level <= selectedZone.maxLevel
    : false;

  return (
    <div>
      <div className="mb-4">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold">Eksploracja</p>
        <h1 className="font-display text-3xl font-semibold text-parchment">Mapa świata</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
        <div
          className="relative aspect-[16/11] overflow-hidden border border-line-soft"
          style={{
            backgroundColor: "oklch(23% 0.006 45)",
            backgroundImage:
              "repeating-linear-gradient(115deg, oklch(23% 0.006 45) 0px, oklch(23% 0.006 45) 18px, oklch(28% 0.007 45) 18px, oklch(28% 0.007 45) 36px)",
          }}
        >
          {ordered.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-parchment-faint">
              Brak skonfigurowanych krain.
            </p>
          )}
          {ordered.map((zone, i) => {
            const pos = pinPosition(i, ordered.length);
            const eligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
            const isCurrent = zone.id === character.currentZoneId;
            const isSelected = zone.id === selectedZoneId;
            return (
              <button
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                style={{ top: pos.top, left: pos.left }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border bg-gradient-to-br from-panel-raised to-panel transition ${
                    isCurrent
                      ? "border-gold-bright shadow-[0_0_14px_oklch(80%_0.14_85_/_0.5)]"
                      : isSelected
                        ? "border-gold ring-2 ring-gold/50"
                        : eligible
                          ? "border-line-soft hover:border-gold/60"
                          : "border-line-soft opacity-50"
                  }`}
                >
                  {zone.isTown ? (
                    <CampfireGlyph className="h-4 w-4 text-gold-bright" />
                  ) : (
                    <WildZoneGlyph className="h-4 w-4 text-parchment-dim" />
                  )}
                </span>
                <span
                  className={`whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium ${
                    isSelected ? "text-gold-bright" : "text-parchment-dim"
                  }`}
                >
                  {zone.name}
                  {isCurrent && <span className="ml-1 text-gold">•</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {selectedZone ? (
            <ZoneInfoCard zone={selectedZone} eligible={selectedEligible} />
          ) : (
            <p className="text-sm text-parchment-faint">Wybierz krainę na mapie.</p>
          )}

          <PanelFrame title="Wszystkie krainy" emphasis="secondary">
            <div className="flex flex-col">
              {ordered.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => setSelectedZoneId(zone.id)}
                  className={`flex items-center justify-between border-b border-line-soft/40 py-2 text-left text-sm transition last:border-b-0 ${
                    zone.id === selectedZoneId ? "text-gold-bright" : "text-parchment-dim hover:text-parchment"
                  }`}
                >
                  <span>
                    {zone.name}
                    {zone.id === character.currentZoneId && (
                      <span className="ml-1.5 text-xs text-gold">(tu jesteś)</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-parchment-faint">
                    poz. {zone.minLevel}-{zone.maxLevel}
                  </span>
                </button>
              ))}
            </div>
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}
