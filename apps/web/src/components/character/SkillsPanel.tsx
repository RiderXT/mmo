import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, SkillCategory, CoreStatKey, StatKey, SkillEffectType } from "@mmo/shared";
import { getPlayerClass } from "../../lib/classesApi";
import { unlockSkill, unlockNode, getCharacterSkills, listCharacterSkillNodes } from "../../lib/charactersApi";
import type { ClassSkillDto, SkillTreeNodeDto } from "../../lib/adminApi";
import { ApiError, API_URL } from "../../lib/apiClient";
import { PanelFrame } from "../common/PanelFrame";
import { SocketCorners } from "../inventory/SocketCorners";
import { SkillSygil, LockGlyph } from "./SkillSygil";
import { SkillTooltip } from "./SkillTooltip";

const CATEGORIES: { key: SkillCategory; label: string }[] = [
  { key: "combat", label: "Walka" },
  { key: "survival", label: "Przetrwanie" },
  { key: "tactics", label: "Taktyka" },
];

// Polish label for each StatKey, in the genitive case so it reads naturally after "do"/"na" —
// e.g. "+3 do ataku". Used both for the passive-skill delta preview and the empty-description
// fallback below.
const STAT_LABELS: Record<StatKey, string> = {
  attack: "ataku",
  defense: "obrony",
  hp: "zdrowia",
  maxMana: "many",
  critChance: "szansy na krytyk",
  critDamage: "obrażeń krytycznych",
  attackSpeed: "szybkości ataku",
  evasion: "uniku",
  damageReduction: "redukcji obrażeń",
  movementSpeed: "szybkości poruszania",
};
// These StatKeys are stored/added as 0..1 fractions (see computeDerivedStats in combat.ts) —
// displayed as a percentage rather than a raw decimal.
const FRACTIONAL_STATS = new Set<StatKey>(["critChance", "critDamage", "evasion", "damageReduction", "movementSpeed"]);

// Noun phrase for each active-skill effectType, used the same way as STAT_LABELS above —
// mirrors SKILL_EFFECT_DETAILS in CombatLog.tsx, which labels the same effects once they fire in
// combat; this labels them ahead of time, as an investment preview.
const ACTIVE_EFFECT_LABELS: Partial<Record<SkillEffectType, string>> = {
  attack_speed: "szybkości ataku",
  defense: "obrony",
  crit: "szansy na krytyk",
  block_chance: "szansy na blok",
  stun: "szansy na ogłuszenie",
  poison: "szansy na otrucie",
  reflect: "szansy na odbicie ciosu",
};

type CoreStats = Record<CoreStatKey, number>;

// Mirrors gatherCombatBuild's skillMagnitudeMultiplier in expeditions/service.ts, minus the tree
// -node contribution (nodes are a separate investment, previewed in their own row/tooltip) — same
// simplification the old per-skill detail panel already made.
function computePower(skill: ClassSkillDto, core: CoreStats, level: number): number {
  return skill.scalingFactor * core[skill.scalingStat] * (1 + skill.levelMagnitudePct * Math.max(0, level - 1));
}

/** What investing exactly one more point right now would grant — the line shown under every
 * skill row, live-updating with each +/− click before anything is actually spent. */
function nextPointDelta(skill: ClassSkillDto, core: CoreStats, effectiveLevel: number): string | null {
  const current = effectiveLevel > 0 ? computePower(skill, core, effectiveLevel) : 0;
  const next = computePower(skill, core, effectiveLevel + 1);
  const delta = next - current;
  if (skill.kind === "passive") {
    if (!skill.targetStat) return null;
    const isPct = FRACTIONAL_STATS.has(skill.targetStat);
    const val = Math.round(delta * (isPct ? 1000 : 10)) / (isPct ? 10 : 10);
    return `+${val}${isPct ? "%" : ""} do ${STAT_LABELS[skill.targetStat]}`;
  }
  if (skill.kind === "active") {
    if (!skill.effectType) return null;
    const val = Math.round(delta * 10) / 10;
    if (skill.effectType === "damage") return `+${val} obrażeń`;
    if (skill.effectType === "heal") return `+${val} leczenia`;
    return `+${val}% ${ACTIVE_EFFECT_LABELS[skill.effectType] ?? ""}`;
  }
  return null;
}

/** Falls back to a synthesized one-liner when the admin left ClassSkill.description empty, so a
 * row never renders with a blank "what does this add" line. */
function fallbackDescription(skill: ClassSkillDto): string {
  if (skill.kind === "passive" && skill.targetStat) return `Zwiększa ${STAT_LABELS[skill.targetStat]}.`;
  if (skill.kind === "active" && skill.effectType) {
    if (skill.effectType === "damage") return "Zadaje dodatkowe obrażenia przy aktywacji.";
    if (skill.effectType === "heal") return "Leczy przy aktywacji.";
    const label = ACTIVE_EFFECT_LABELS[skill.effectType];
    return label ? `Zwiększa ${label} przy aktywacji.` : "";
  }
  return "";
}

function formatNodeEffect(effect: "magnitude" | "cost" | "cooldown", magnitudePct: number): string {
  const pct = Math.round(magnitudePct * 1000) / 10;
  if (effect === "magnitude") return `+${pct}% mocy`;
  if (effect === "cost") return `-${pct}% kosztu many`;
  return `-${pct}% czasu odnowienia`;
}

// requiresNodeId chains are scoped to one skill's own node list — depth 0 = branch root (no
// requirement), depth N = requires a node at depth N-1. Arbitrary chain length supported.
function computeDepths(nodes: SkillTreeNodeDto[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, number>();
  function depthOf(node: SkillTreeNodeDto, seen: Set<string>): number {
    if (cache.has(node.id)) return cache.get(node.id)!;
    if (!node.requiresNodeId || seen.has(node.id)) return 0;
    const parent = byId.get(node.requiresNodeId);
    if (!parent) return 0;
    const depth = 1 + depthOf(parent, new Set(seen).add(node.id));
    cache.set(node.id, depth);
    return depth;
  }
  const result = new Map<string, number>();
  for (const n of nodes) result.set(n.id, depthOf(n, new Set()));
  return result;
}

/** Skill-tree tile — same 1-slot footprint and socket-corner treatment as an equipment slot (see
 * inventory/EquipSlotBox.tsx + ItemBox.tsx), so the tree reads as part of the same visual system
 * instead of a bespoke widget. Sized via className so the row icon (52px, matching the mockup)
 * and the node-tree tiles (56px, unchanged) can share this one component. */
function Tile({
  level,
  locked,
  maxed,
  selected,
  imageUrl,
  onSelect,
  className = "h-14 w-14",
}: {
  level: number | null;
  locked: boolean;
  maxed: boolean;
  selected: boolean;
  imageUrl: string | null;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex shrink-0 items-center justify-center transition ${className} ${
        locked
          ? "border-2 border-dashed border-line-soft/60 opacity-60"
          : maxed
            ? "border border-gold-bright/70 bg-gold-bright/10"
            : level
              ? "border border-gold/50 bg-gold/10"
              : "border border-line-soft/70 bg-panel-raised hover:border-gold/60"
      } ${selected ? "ring-2 ring-gold-bright ring-offset-2 ring-offset-ink" : ""}`}
    >
      {!locked && <SocketCorners />}
      {imageUrl ? (
        <img
          src={`${API_URL}${imageUrl}`}
          alt=""
          className={`absolute inset-0 h-full w-full object-contain ${locked ? "opacity-40 grayscale" : ""}`}
        />
      ) : locked ? (
        <LockGlyph className="h-5 w-5 text-parchment-faint" />
      ) : (
        <SkillSygil className="h-6 w-6 text-parchment-dim" />
      )}
      {/* An uploaded icon still previews here when locked (dimmed) instead of being hidden behind
       * the lock glyph entirely — only the corner badge below communicates the locked state, so
       * the player can see what they're unlocking before spending points on it. */}
      {locked && imageUrl && (
        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-ink/80 p-0.5">
          <LockGlyph className="h-3 w-3 text-parchment-faint" />
        </span>
      )}
      {level != null && level > 0 && (
        <span className="absolute left-0.5 top-0.5 text-xs text-gold-bright">+{level}</span>
      )}
    </button>
  );
}

function Connector() {
  return <div className="h-4 w-px bg-line-soft/60" />;
}

/** The node tree belonging to one root skill — unchanged immediate-commit behavior (unlike the
 * skill row above it, a node is still spent the instant "Ulepsz" is clicked), just relocated
 * under the skill's row instead of always-visible beside a tile grid. */
function NodeTree({
  skill,
  skillLevel,
  nodeLevelById,
  allNodesById,
  selection,
  setSelection,
}: {
  skill: ClassSkillDto;
  skillLevel: number;
  nodeLevelById: Map<string, number>;
  allNodesById: Map<string, SkillTreeNodeDto>;
  selection: Selection | null;
  setSelection: (s: Selection) => void;
}) {
  const depths = computeDepths(skill.nodes);
  const maxDepth = skill.nodes.length ? Math.max(...skill.nodes.map((n) => depths.get(n.id) ?? 0)) : -1;
  const rows = Array.from({ length: maxDepth + 1 }, (_, d) => skill.nodes.filter((n) => depths.get(n.id) === d));

  return (
    <div className="flex flex-col items-center gap-1">
      {rows.map((row, depth) => (
        <div key={depth} className="flex gap-3">
          {row.map((node) => {
            const level = nodeLevelById.get(node.id) ?? 0;
            const parentLevel = node.requiresNodeId ? (nodeLevelById.get(node.requiresNodeId) ?? 0) : 1;
            const requiredNode = node.requiresNodeId ? allNodesById.get(node.requiresNodeId) : null;
            const nodeLocked = skillLevel < 1 || parentLevel < 1;
            const maxed = level >= node.maxLevel;
            return (
              <div key={node.id} className="flex flex-col items-center">
                <Connector />
                <SkillTooltip
                  title={node.name}
                  kindLabel={node.effect === "magnitude" ? "Moc" : node.effect === "cost" ? "Koszt many" : "Odnowienie"}
                  status={nodeLocked && requiredNode ? `Wymaga: ${requiredNode.name}` : `Poziom ${level}/${node.maxLevel}`}
                  description={node.description || undefined}
                  effectLines={[
                    `${formatNodeEffect(node.effect, node.magnitudePct)} za poziom`,
                    ...(level > 0 ? [`Obecnie: ${formatNodeEffect(node.effect, node.magnitudePct * level)}`] : []),
                  ]}
                  costLabel={!nodeLocked && !maxed ? `Koszt: ${node.pointCost} pkt` : maxed ? "Poziom maksymalny" : null}
                  locked={nodeLocked}
                >
                  <Tile
                    level={level}
                    locked={nodeLocked}
                    maxed={maxed}
                    selected={selection?.type === "node" && selection.nodeId === node.id}
                    imageUrl={node.imageUrl}
                    onSelect={() => setSelection({ type: "node", nodeId: node.id })}
                  />
                </SkillTooltip>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type Selection = { type: "node"; nodeId: string };

export function SkillsPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<SkillCategory>("combat");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  // Skill points staged locally but not yet spent — nothing here has hit the server until
  // "Zatwierdź rozdanie punktów" is clicked. Node investment (below) is unaffected and stays
  // immediate, unchanged from before.
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const classQuery = useQuery({
    queryKey: ["class", character.classId],
    queryFn: () => getPlayerClass(character.classId!),
    enabled: !!character.classId,
  });

  const skillsQuery = useQuery({
    queryKey: ["character-skills", character.id],
    queryFn: () => getCharacterSkills(character.id),
  });

  const nodesQuery = useQuery({
    queryKey: ["character-skill-nodes", character.id],
    queryFn: () => listCharacterSkillNodes(character.id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["character-skills", character.id] });
    queryClient.invalidateQueries({ queryKey: ["character-skill-nodes", character.id] });
    queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    queryClient.invalidateQueries({ queryKey: ["combat-stats", character.id] });
  };

  const unlockNodeMutation = useMutation({
    mutationFn: (nodeId: string) => unlockNode(character.id, nodeId),
    onSuccess: () => {
      setError(null);
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zainwestować w węzeł"),
  });

  if (!character.classId || !classQuery.data) return null;

  const skillLevelById = new Map(skillsQuery.data?.map((s) => [s.classSkillId, s.level]) ?? []);
  const nodeLevelById = new Map(nodesQuery.data?.map((n) => [n.nodeId, n.level]) ?? []);
  const skillsInCategory = classQuery.data.skills.filter((s) => s.category === category);
  const allNodesById = new Map(classQuery.data.skills.flatMap((s) => s.nodes.map((n) => [n.id, n] as const)));
  const selectedNode = selection ? allNodesById.get(selection.nodeId) : undefined;

  const core: CoreStats = {
    strength: character.strength,
    vitality: character.vitality,
    dexterity: character.dexterity,
    intelligence: character.intelligence,
  };

  const totalPendingCost = classQuery.data.skills.reduce(
    (sum, s) => sum + (pending.get(s.id) ?? 0) * s.unlockCost,
    0,
  );
  const totalPendingCount = Array.from(pending.values()).reduce((sum, n) => sum + n, 0);
  const remainingPoints = character.unspentSkillPoints - totalPendingCost;

  function addPending(skill: ClassSkillDto) {
    const committed = skillLevelById.get(skill.id) ?? 0;
    const staged = pending.get(skill.id) ?? 0;
    if (committed + staged >= skill.maxLevel || remainingPoints < skill.unlockCost) return;
    setPending(new Map(pending).set(skill.id, staged + 1));
  }

  function removePending(skillId: string) {
    const staged = pending.get(skillId) ?? 0;
    if (staged <= 0) return;
    const next = new Map(pending);
    if (staged === 1) next.delete(skillId);
    else next.set(skillId, staged - 1);
    setPending(next);
  }

  // Deliberately not useMutation: a partial failure mid-batch (e.g. stale maxLevel after a
  // concurrent change) must leave only the NOT-yet-committed increments staged, not wipe pending
  // entirely or leave it stuck at the pre-confirm count — see the try/catch below.
  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    const remaining = new Map(pending);
    try {
      for (const [skillId, count] of pending.entries()) {
        for (let i = 0; i < count; i++) {
          await unlockSkill(character.id, skillId);
          const left = (remaining.get(skillId) ?? 0) - 1;
          if (left <= 0) remaining.delete(skillId);
          else remaining.set(skillId, left);
        }
      }
      setPending(new Map());
    } catch (err) {
      setPending(remaining);
      setError(err instanceof ApiError ? err.message : "Nie udało się zatwierdzić części punktów");
    } finally {
      setConfirming(false);
      invalidateAll();
    }
  }

  return (
    <PanelFrame title={`Umiejętności (${classQuery.data.name})`}>
      <div className="flex gap-2 border-b border-line pb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              category === c.key
                ? "bg-gold text-ink"
                : "text-parchment-dim hover:bg-panel-raised hover:text-parchment"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {skillsInCategory.length === 0 ? (
        <p className="mt-3 text-sm text-parchment-faint">Brak umiejętności w tej kategorii.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {skillsInCategory.map((skill) => {
            const committedLevel = skillLevelById.get(skill.id) ?? 0;
            const stagedLevel = pending.get(skill.id) ?? 0;
            const effectiveLevel = committedLevel + stagedLevel;
            const maxed = effectiveLevel >= skill.maxLevel;
            const canAdd = !maxed && remainingPoints >= skill.unlockCost;
            const hasNodes = skill.nodes.length > 0;
            const expanded = expandedSkillId === skill.id;
            const delta = maxed ? null : nextPointDelta(skill, core, effectiveLevel);
            const description = skill.description || fallbackDescription(skill);

            return (
              <div key={skill.id} className="border border-line-soft/60 bg-panel-raised/40">
                <div
                  className={`flex items-center gap-4 p-3 ${hasNodes ? "cursor-pointer" : ""}`}
                  onClick={hasNodes ? () => setExpandedSkillId(expanded ? null : skill.id) : undefined}
                >
                  <Tile
                    level={effectiveLevel}
                    locked={false}
                    maxed={maxed}
                    selected={false}
                    imageUrl={skill.imageUrl}
                    onSelect={() => hasNodes && setExpandedSkillId(expanded ? null : skill.id)}
                    className="h-[52px] w-[52px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-sm text-parchment">{skill.name}</p>
                      {skill.kind === "active" && (
                        <span className="text-[11px] text-parchment-faint">cd {skill.cooldownSeconds}s</span>
                      )}
                      {hasNodes && (
                        <span className="text-[10px] text-parchment-faint">{expanded ? "▲" : "▼"}</span>
                      )}
                    </div>
                    {description && <p className="mt-0.5 text-xs text-parchment-faint">{description}</p>}
                    {delta && (
                      <p className="mt-1 text-xs text-gold-bright">
                        Kolejny punkt (koszt {skill.unlockCost} pkt): {delta}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <span className="min-w-[110px] text-right text-sm tabular-nums text-parchment-dim">
                      Poziom {committedLevel}
                      {stagedLevel > 0 && <span className="text-gold-bright"> +{stagedLevel} oczek.</span>}/{skill.maxLevel}
                    </span>
                    {stagedLevel > 0 && (
                      <button
                        onClick={() => removePending(skill.id)}
                        className="flex h-7 w-7 items-center justify-center border border-line-soft text-parchment-dim hover:border-red-400 hover:text-red-400"
                        aria-label="Cofnij oczekujący punkt"
                      >
                        −
                      </button>
                    )}
                    {maxed ? (
                      <span className="text-xs text-gold-bright">MAX</span>
                    ) : (
                      <button
                        onClick={() => addPending(skill)}
                        disabled={!canAdd}
                        className="flex h-7 w-7 items-center justify-center border border-gold/50 text-gold hover:border-gold-bright hover:text-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Dodaj punkt"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
                {expanded && hasNodes && (
                  <div className="border-t border-line-soft/40 p-3">
                    <NodeTree
                      skill={skill}
                      skillLevel={committedLevel}
                      nodeLevelById={nodeLevelById}
                      allNodesById={allNodesById}
                      selection={selection}
                      setSelection={setSelection}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-line-soft/40 pt-3">
        {selectedNode ? (
          (() => {
            const level = nodeLevelById.get(selectedNode.id) ?? 0;
            const maxed = level >= selectedNode.maxLevel;
            const requiredNode = selectedNode.requiresNodeId ? allNodesById.get(selectedNode.requiresNodeId) : null;
            const parentLevel = selectedNode.requiresNodeId
              ? (nodeLevelById.get(selectedNode.requiresNodeId) ?? 0)
              : 1;
            const locked = parentLevel < 1;
            return (
              <div>
                <p className="font-medium text-parchment">{selectedNode.name}</p>
                {selectedNode.description && (
                  <p className="mt-0.5 text-xs text-parchment-faint">{selectedNode.description}</p>
                )}
                <p className="mt-1 text-xs text-parchment-dim">
                  {formatNodeEffect(selectedNode.effect, selectedNode.magnitudePct)} za poziom — obecnie:{" "}
                  {formatNodeEffect(selectedNode.effect, selectedNode.magnitudePct * level)}
                </p>
                <p className="text-xs tabular-nums text-parchment-dim">
                  Poziom {level}/{selectedNode.maxLevel}
                </p>
                {locked && requiredNode && (
                  <p className="mt-1 text-xs text-red-400">Najpierw odblokuj węzeł: {requiredNode.name}</p>
                )}
                {maxed ? (
                  <p className="mt-2 text-xs text-gold-bright">Maksymalny poziom.</p>
                ) : (
                  !locked && (
                    <button
                      onClick={() => unlockNodeMutation.mutate(selectedNode.id)}
                      disabled={character.unspentSkillPoints < selectedNode.pointCost || unlockNodeMutation.isPending}
                      className="mt-2 rounded-md bg-gold px-3 py-1 text-xs font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {level === 0 ? "Odblokuj" : "Ulepsz"} (koszt: {selectedNode.pointCost})
                    </button>
                  )
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-parchment-faint">Rozwiń umiejętność i wybierz węzeł, aby zobaczyć szczegóły.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-line-soft/40 pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-parchment-dim">Niewydane punkty</span>
          <span className="tabular-nums text-gold-bright">
            {remainingPoints}
            {totalPendingCount > 0 && (
              <span className="ml-1 text-xs text-parchment-faint">(zarezerwowano {totalPendingCost})</span>
            )}
          </span>
        </div>
        {totalPendingCount > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPending(new Map())}
              disabled={confirming}
              className="rounded-md border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-30"
            >
              Anuluj
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
            >
              {confirming ? "Zatwierdzanie…" : `Zatwierdź rozdanie punktów (${totalPendingCount} pkt)`}
            </button>
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
