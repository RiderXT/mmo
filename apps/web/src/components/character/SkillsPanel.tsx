import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, SkillCategory } from "@mmo/shared";
import { getPlayerClass } from "../../lib/classesApi";
import { unlockSkill, unlockNode, getCharacterSkills, listCharacterSkillNodes } from "../../lib/charactersApi";
import type { ClassSkillDto, SkillTreeNodeDto } from "../../lib/adminApi";
import { ApiError } from "../../lib/apiClient";
import { PanelFrame } from "../common/PanelFrame";

const CATEGORIES: { key: SkillCategory; label: string }[] = [
  { key: "combat", label: "Walka" },
  { key: "survival", label: "Przetrwanie" },
  { key: "tactics", label: "Taktyka" },
];

function skillIcon(skill: ClassSkillDto): string {
  if (skill.kind === "active") return skill.effectType === "heal" ? "✨" : "🔥";
  switch (skill.targetStat) {
    case "attack":
      return "⚔️";
    case "defense":
    case "damageReduction":
      return "🛡️";
    case "hp":
      return "❤️";
    case "maxMana":
      return "🔷";
    case "critChance":
      return "🎯";
    case "critDamage":
      return "💥";
    case "attackSpeed":
      return "⚡";
    case "evasion":
    case "movementSpeed":
      return "👢";
    default:
      return "⭐";
  }
}

function nodeIcon(node: SkillTreeNodeDto): string {
  if (node.effect === "cost") return "🔷";
  if (node.effect === "cooldown") return "⏱️";
  return "⬆️";
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

type Selection = { type: "skill"; skillId: string } | { type: "node"; nodeId: string };

function Tile({
  icon,
  name,
  levelLabel,
  locked,
  selected,
  onSelect,
}: {
  icon: string;
  name: string;
  levelLabel: string | null;
  locked: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex w-20 flex-col items-center gap-1 rounded-md border p-2 text-center transition ${
        selected
          ? "border-gold bg-gold/10"
          : locked
            ? "border-line-soft/40 opacity-50"
            : "border-line-soft/60 hover:border-gold/60"
      }`}
    >
      {locked && <span className="absolute -right-1.5 -top-1.5 text-xs">🔒</span>}
      <span className="text-xl">{icon}</span>
      <span className="line-clamp-1 text-[11px] text-parchment-dim">{name}</span>
      {levelLabel && <span className="text-[10px] tabular-nums text-gold-bright">{levelLabel}</span>}
    </button>
  );
}

function Connector() {
  return <div className="h-4 w-px bg-line-soft/60" />;
}

export function SkillsPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<SkillCategory>("combat");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const unlockSkillMutation = useMutation({
    mutationFn: (classSkillId: string) => unlockSkill(character.id, classSkillId),
    onSuccess: () => {
      setError(null);
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się odblokować umiejętności"),
  });

  const unlockNodeMutation = useMutation({
    mutationFn: (nodeId: string) => unlockNode(character.id, nodeId),
    onSuccess: () => {
      setError(null);
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zainwestować w węzeł"),
  });

  if (!character.classId || !classQuery.data) return null;

  const unlockedByClassSkillId = new Map(skillsQuery.data?.map((s) => [s.classSkillId, s.unlocked]) ?? []);
  const nodeLevelById = new Map(nodesQuery.data?.map((n) => [n.nodeId, n.level]) ?? []);
  const skillsInCategory = classQuery.data.skills.filter((s) => s.category === category);

  const allNodesById = new Map(classQuery.data.skills.flatMap((s) => s.nodes.map((n) => [n.id, n] as const)));
  const selectedSkill =
    selection?.type === "skill" ? classQuery.data.skills.find((s) => s.id === selection.skillId) : undefined;
  const selectedNode = selection?.type === "node" ? allNodesById.get(selection.nodeId) : undefined;

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
        <div className="mt-4 flex flex-wrap justify-center gap-8">
          {skillsInCategory.map((skill) => {
            const unlocked = unlockedByClassSkillId.get(skill.id) ?? false;
            const depths = computeDepths(skill.nodes);
            const maxDepth = skill.nodes.length ? Math.max(...skill.nodes.map((n) => depths.get(n.id) ?? 0)) : -1;
            const rows = Array.from({ length: maxDepth + 1 }, (_, d) =>
              skill.nodes.filter((n) => depths.get(n.id) === d),
            );
            return (
              <div key={skill.id} className="flex flex-col items-center gap-1">
                <Tile
                  icon={skillIcon(skill)}
                  name={skill.name}
                  levelLabel={unlocked ? "Lv 1" : null}
                  locked={!unlocked}
                  selected={selection?.type === "skill" && selection.skillId === skill.id}
                  onSelect={() => setSelection({ type: "skill", skillId: skill.id })}
                />
                {rows.map((row, depth) => (
                  <div key={depth} className="flex gap-3">
                    {row.map((node) => {
                      const level = nodeLevelById.get(node.id) ?? 0;
                      const parentLevel = node.requiresNodeId ? (nodeLevelById.get(node.requiresNodeId) ?? 0) : 1;
                      const nodeLocked = !unlocked || parentLevel < 1;
                      return (
                        <div key={node.id} className="flex flex-col items-center">
                          <Connector />
                          <Tile
                            icon={nodeIcon(node)}
                            name={node.name}
                            levelLabel={level > 0 ? `Lv ${level}/${node.maxLevel}` : null}
                            locked={nodeLocked}
                            selected={selection?.type === "node" && selection.nodeId === node.id}
                            onSelect={() => setSelection({ type: "node", nodeId: node.id })}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-line-soft/40 pt-3">
        {selectedSkill && (
          <div>
            <p className="font-medium text-parchment">{selectedSkill.name}</p>
            {selectedSkill.description && (
              <p className="mt-0.5 text-xs text-parchment-faint">{selectedSkill.description}</p>
            )}
            {unlockedByClassSkillId.get(selectedSkill.id) ? (
              <p className="mt-2 text-xs text-gold-bright">Umiejętność odblokowana.</p>
            ) : (
              <button
                onClick={() => unlockSkillMutation.mutate(selectedSkill.id)}
                disabled={character.unspentSkillPoints < selectedSkill.unlockCost || unlockSkillMutation.isPending}
                className="mt-2 rounded-md bg-gold px-3 py-1 text-xs font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
              >
                Odblokuj (koszt: {selectedSkill.unlockCost})
              </button>
            )}
          </div>
        )}
        {selectedNode &&
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
          })()}
        {!selectedSkill && !selectedNode && (
          <p className="text-sm text-parchment-faint">Wybierz umiejętność lub węzeł, aby zobaczyć szczegóły.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line-soft/40 pt-2 text-sm">
        <span className="text-parchment-dim">Punkty umiejętności</span>
        <span className="tabular-nums text-gold-bright">{character.unspentSkillPoints}</span>
      </div>
    </PanelFrame>
  );
}
