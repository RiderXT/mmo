import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { listPlayerZones } from "../../lib/zonesApi";
import type { ZoneDto } from "../../lib/adminApi";
import { ZoneInfoCard } from "../../components/expedition/ZoneInfoCard";
import { CampfireGlyph, WildZoneGlyph } from "../../components/expedition/ZoneGlyphs";
import { PanelFrame } from "../../components/common/PanelFrame";
import { Modal } from "../../components/common/Modal";

type Category = "all" | "combat" | "fishing" | "mining";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "combat", label: "Expowiska" },
  { key: "fishing", label: "Łowiska" },
  { key: "mining", label: "Kopalnie" },
];

function matchesCategory(zone: ZoneDto, category: Category): boolean {
  if (category === "all") return true;
  if (category === "combat") return zone.monsters.length > 0;
  if (category === "fishing") return zone.fishingSpot !== null;
  return zone.mine !== null;
}

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

/** Purely explorational — browse real zone lore/level-ranges/monsters+drops on a map instead of
 * the flat list ZoneMapPath already uses for actually traveling. No travel action here on
 * purpose: this is a new, separate tab (see docs/architecture.md) that may later replace the
 * Ekspedycje map, not a duplicate of its travel/combat flow. */
export function WorldMapTab({ character }: { character: Character }) {
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const [category, setCategory] = useState<Category>("all");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const ordered = [...(zonesQuery.data ?? [])].sort((a, b) => a.minLevel - b.minLevel);
  const filtered = ordered.filter((z) => matchesCategory(z, category));
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

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              category === c.key
                ? "border-gold bg-gold/10 text-gold-bright"
                : "border-line-soft text-parchment-dim hover:bg-panel-raised"
            }`}
          >
            {c.label}
          </button>
        ))}
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
          {filtered.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-parchment-faint">
              {ordered.length === 0 ? "Brak skonfigurowanych krain." : "Brak krain w tej kategorii."}
            </p>
          )}
          {ordered.map((zone, i) => {
            if (!matchesCategory(zone, category)) return null;
            const pos = pinPosition(i, ordered.length);
            const eligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
            const isCurrent = zone.id === character.currentZoneId;
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
                <span className="whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-parchment-dim">
                  {zone.name}
                  {isCurrent && <span className="ml-1 text-gold">•</span>}
                </span>
              </button>
            );
          })}
        </div>

        <PanelFrame title="Krainy" emphasis="secondary">
          <div className="flex flex-col">
            {filtered.length === 0 && <p className="py-2 text-sm text-parchment-faint">Brak krain w tej kategorii.</p>}
            {filtered.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                className="flex items-center justify-between border-b border-line-soft/40 py-2 text-left text-sm text-parchment-dim transition last:border-b-0 hover:text-parchment"
              >
                <span>
                  {zone.name}
                  {zone.id === character.currentZoneId && <span className="ml-1.5 text-xs text-gold">(tu jesteś)</span>}
                </span>
                <span className="shrink-0 text-xs text-parchment-faint">
                  poz. {zone.minLevel}-{zone.maxLevel}
                </span>
              </button>
            ))}
          </div>
        </PanelFrame>
      </div>

      {selectedZone && (
        <Modal title={selectedZone.name} onClose={() => setSelectedZoneId(null)}>
          <ZoneInfoCard zone={selectedZone} eligible={selectedEligible} />
        </Modal>
      )}
    </div>
  );
}
