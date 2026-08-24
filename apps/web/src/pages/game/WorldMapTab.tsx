import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, BattleTacticsInput } from "@mmo/shared";
import { listPlayerZones } from "../../lib/zonesApi";
import type { ZoneDto } from "../../lib/adminApi";
import { startTravel } from "../../lib/travelApi";
import { startExpedition, getExpeditionDuration } from "../../lib/expeditionsApi";
import { getCharacterSkills } from "../../lib/charactersApi";
import { getPlayerClass } from "../../lib/classesApi";
import { ApiError } from "../../lib/apiClient";
import { ZoneInfoCard } from "../../components/expedition/ZoneInfoCard";
import { MonsterAttackPanel } from "../../components/expedition/MonsterAttackPanel";
import { BattleTacticsModal } from "../../components/expedition/BattleTacticsModal";
import { LiveCombatCard } from "../../components/expedition/LiveCombatCard";
import { CampfireGlyph, WildZoneGlyph } from "../../components/expedition/ZoneGlyphs";
import { PanelFrame } from "../../components/common/PanelFrame";

type Category = "combat" | "fishing" | "mining";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "combat", label: "Expowiska" },
  { key: "fishing", label: "Łowiska" },
  { key: "mining", label: "Kopalnie" },
];

function matchesCategory(zone: ZoneDto, category: Category): boolean {
  if (category === "combat") return zone.monsters.length > 0;
  if (category === "fishing") return zone.fishingSpot !== null;
  return zone.mine !== null;
}

// Same 30-level banding convention as ZoneMapPath.tsx ("Acts" here just get their own row above
// the map instead of tabs above a vertical path) — bucketed off the actual seeded zone levels,
// not a hardcoded zone count, so this keeps working as zones are added/removed in admin.
const ACT_SIZE = 30;
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Deterministic scattered pin layout — no hand-painted map illustration (same "no art pipeline"
 * situation ZoneMapPath already notes), so pins sweep loosely from bottom-left to top-right in
 * level order with a gentle wave, computed against whichever zones are visible in the active act
 * so a thin act still spreads across the whole map instead of clustering in one corner. */
function pinPosition(index: number, total: number) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const left = 10 + t * 78;
  const wave = Math.sin(t * Math.PI * 2.4) * 16;
  const top = 80 - t * 58 + wave;
  return { top: `${Math.min(88, Math.max(8, top))}%`, left: `${left}%` };
}

/** Real, working entry point into an expedition — not a placeholder. Clicking a zone shows its
 * actual monster roster (level/hp/exp) with checkbox selection; "Ruszaj" opens the same tactics
 * lobby Ekspedycje uses (BattleTacticsModal) and then calls the same startExpedition endpoint.
 * Traveling-there is still a separate, explicit step (see modules/travel — the backend rejects
 * starting a fight in a zone the character hasn't arrived at yet), so this offers a "Wyrusz do
 * krainy" button first when needed rather than silently failing.
 *
 * This is a new, separate tab (see docs/architecture.md) that may later replace the Ekspedycje
 * map entirely, not a duplicate maintained in parallel forever. */
export function WorldMapTab({ character }: { character: Character }) {
  const queryClient = useQueryClient();
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const durationQuery = useQuery({ queryKey: ["expedition-duration"], queryFn: getExpeditionDuration });
  const classQuery = useQuery({
    queryKey: ["class", character.classId],
    queryFn: () => getPlayerClass(character.classId!),
    enabled: !!character.classId,
  });
  const characterSkillsQuery = useQuery({
    queryKey: ["character-skills", character.id],
    queryFn: () => getCharacterSkills(character.id),
  });

  const ordered = [...(zonesQuery.data ?? [])].sort((a, b) => a.minLevel - b.minLevel);
  const maxLevel = ordered.length > 0 ? Math.max(...ordered.map((z) => z.maxLevel)) : 0;
  const actCount = Math.max(1, Math.ceil(maxLevel / ACT_SIZE));
  const acts = Array.from({ length: actCount }, (_, i) => ({ start: i * ACT_SIZE + 1, end: (i + 1) * ACT_SIZE }));

  const [activeActIndex, setActiveActIndex] = useState(0);
  const [category, setCategory] = useState<Category>("combat");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pendingMonsterIds, setPendingMonsterIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = acts[activeActIndex] ?? acts[0];
  const zonesInAct = ordered.filter((z) => z.minLevel >= (act?.start ?? 1) && z.minLevel <= (act?.end ?? ACT_SIZE));
  const selectedZone = ordered.find((z) => z.id === selectedZoneId) ?? null;
  const eligible = selectedZone
    ? character.level >= selectedZone.minLevel && character.level <= selectedZone.maxLevel
    : false;
  const isHere = selectedZone?.id === character.currentZoneId;

  const unlockedClassSkillIds = new Set(
    characterSkillsQuery.data?.filter((s) => s.unlocked).map((s) => s.classSkillId) ?? [],
  );
  const activeSkillsForTactics = (classQuery.data?.skills ?? []).filter(
    (s) => s.kind === "active" && unlockedClassSkillIds.has(s.id),
  );

  function selectZone(zone: ZoneDto) {
    setSelectedZoneId(zone.id);
    setError(null);
    if (!matchesCategory(zone, category)) {
      const next = CATEGORIES.find((c) => matchesCategory(zone, c.key));
      if (next) setCategory(next.key);
    }
  }

  const travelMutation = useMutation({
    mutationFn: (zoneId: string) => startTravel(character.id, zoneId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wyruszyć w drogę"),
  });

  const startMutation = useMutation({
    mutationFn: (tactics: BattleTacticsInput) =>
      startExpedition(character.id, selectedZone!.id, pendingMonsterIds ?? [], tactics),
    onSuccess: () => {
      setError(null);
      setPendingMonsterIds(null);
      // No local state needed to "enter combat mode" — refetching the character sets
      // activeExpeditionId, and the top-level check below swaps the whole page into
      // LiveCombatCard as soon as that comes back.
      queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się rozpocząć walki"),
  });

  // An active expedition takes over the whole tab — no exploration chrome (header/Acts/category
  // pills), just the fight, matching the mockup's dedicated combat page. Leaving/claiming clears
  // activeExpeditionId, which drops back to the normal browsing UI on its own (see onClaimed).
  if (character.activeExpeditionId) {
    return (
      <LiveCombatCard
        character={character}
        onClaimed={() => queryClient.invalidateQueries({ queryKey: ["character", character.id] })}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {acts.map((a, i) => (
          <button
            key={i}
            onClick={() => setActiveActIndex(i)}
            className={`border px-4 py-2 text-left transition ${
              activeActIndex === i
                ? "border-gold bg-gold/10"
                : "border-line-soft hover:border-line-soft hover:bg-panel-raised"
            }`}
          >
            <p
              className={`font-display text-xs font-semibold uppercase tracking-widest ${
                activeActIndex === i ? "text-gold-bright" : "text-parchment-dim"
              }`}
            >
              {ROMAN_NUMERALS[i] ?? i + 1} Akt
            </p>
            <p className="text-[11px] text-parchment-faint">
              poz. {a.start}-{a.end}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
          <div
            className="relative aspect-[16/11] overflow-hidden border border-line-soft"
            style={{
              backgroundColor: "oklch(23% 0.006 45)",
              backgroundImage:
                "repeating-linear-gradient(115deg, oklch(23% 0.006 45) 0px, oklch(23% 0.006 45) 18px, oklch(28% 0.007 45) 18px, oklch(28% 0.007 45) 36px)",
            }}
          >
            {zonesInAct.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-parchment-faint">
                Brak krain w tym akcie.
              </p>
            )}
            {zonesInAct.map((zone, i) => {
              const pos = pinPosition(i, zonesInAct.length);
              const zoneEligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
              const isCurrent = zone.id === character.currentZoneId;
              const isSelected = zone.id === selectedZoneId;
              const inActiveCategory = matchesCategory(zone, category);
              return (
                <button
                  key={zone.id}
                  onClick={() => selectZone(zone)}
                  style={{ top: pos.top, left: pos.left }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 transition ${
                    inActiveCategory ? "" : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border bg-gradient-to-br from-panel-raised to-panel transition ${
                      isCurrent
                        ? "border-gold-bright shadow-[0_0_14px_oklch(80%_0.14_85_/_0.5)]"
                        : isSelected
                          ? "border-gold ring-2 ring-gold/50"
                          : zoneEligible
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

          <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
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

          <PanelFrame title={CATEGORIES.find((c) => c.key === category)?.label ?? ""} emphasis="secondary">
            {!selectedZone ? (
              <p className="text-sm text-parchment-faint">Wybierz krainę na mapie.</p>
            ) : !matchesCategory(selectedZone, category) ? (
              <p className="text-sm text-parchment-faint">
                {selectedZone.name} nie ma tu nic do pokazania — spróbuj innej zakładki.
              </p>
            ) : category !== "combat" ? (
              <ZoneInfoCard
                zone={selectedZone}
                eligible={character.level >= selectedZone.minLevel && character.level <= selectedZone.maxLevel}
              />
            ) : !eligible ? (
              <div>
                <p className="font-display text-sm font-semibold text-gold-bright">{selectedZone.name}</p>
                <p className="mt-2 text-sm font-medium text-red-400">
                  Wymagany poziom {selectedZone.minLevel}-{selectedZone.maxLevel}.
                </p>
              </div>
            ) : !isHere ? (
              <div>
                <p className="font-display text-sm font-semibold text-gold-bright">{selectedZone.name}</p>
                <p className="mt-2 text-sm text-parchment-dim">Musisz najpierw dotrzeć do tej krainy.</p>
                <button
                  onClick={() => travelMutation.mutate(selectedZone.id)}
                  disabled={travelMutation.isPending}
                  className="mt-3 rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Wyrusz do krainy
                </button>
              </div>
            ) : selectedZone.monsters.length === 0 ? (
              <p className="text-sm text-parchment-faint">Ta kraina nie ma jeszcze potworów.</p>
            ) : (
              <MonsterAttackPanel
                zone={selectedZone}
                durationMinutes={durationQuery.data?.minutes ?? null}
                confirmLabel="Ruszaj"
                onConfirm={(ids) => {
                  setPendingMonsterIds(ids);
                  setError(null);
                }}
              />
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {error}
              </p>
            )}
          </PanelFrame>
          </div>
        </div>

      {pendingMonsterIds && selectedZone && (
        <BattleTacticsModal
          activeSkills={activeSkillsForTactics}
          onBack={() => setPendingMonsterIds(null)}
          onConfirm={(tactics) => startMutation.mutate(tactics)}
        />
      )}
    </div>
  );
}
