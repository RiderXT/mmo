import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { getPlayerClass } from "../../lib/classesApi";
import { unlockSkill, unlockNode, getCharacterSkills, listCharacterSkillNodes } from "../../lib/charactersApi";
import { ApiError } from "../../lib/apiClient";
import { PanelFrame } from "../common/PanelFrame";

function formatNodeEffect(effect: "magnitude" | "cost" | "cooldown", magnitudePct: number): string {
  const pct = Math.round(magnitudePct * 100);
  if (effect === "magnitude") return `+${pct}% mocy`;
  if (effect === "cost") return `-${pct}% kosztu many`;
  return `-${pct}% czasu odnowienia`;
}

export function SkillsPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient();
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
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się odblokować węzła"),
  });

  if (!character.classId || !classQuery.data) return null;

  const unlockedByClassSkillId = new Map(skillsQuery.data?.map((s) => [s.classSkillId, s.unlocked]) ?? []);
  const unlockedNodeIds = new Set(nodesQuery.data?.map((n) => n.nodeId) ?? []);

  return (
    <PanelFrame
      title={`Umiejętności (${classQuery.data.name})`}
      headerRight={
        <span className="text-xs normal-case tracking-normal text-parchment-dim">
          Niewydane punkty: <span className="text-gold-bright">{character.unspentSkillPoints}</span>
        </span>
      }
    >
      <div className="space-y-3">
        {classQuery.data.skills.map((skill) => {
          const unlocked = unlockedByClassSkillId.get(skill.id) ?? false;
          return (
            <div key={skill.id} className="rounded-md border border-line-soft/60 p-2">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-parchment-dim">{skill.name}</span>
                  <span className="ml-2 text-xs text-parchment-faint">
                    {skill.kind === "active" ? `aktywna, cd ${skill.cooldownSeconds}s` : "pasywna"}
                  </span>
                </div>
                {!unlocked && (
                  <button
                    onClick={() => unlockSkillMutation.mutate(skill.id)}
                    disabled={character.unspentSkillPoints < skill.unlockCost || unlockSkillMutation.isPending}
                    className="rounded-md bg-gold px-3 py-1 text-xs font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Odblokuj (koszt: {skill.unlockCost})
                  </button>
                )}
              </div>

              {unlocked && skill.nodes.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-line-soft/40 pt-2">
                  {skill.nodes.map((node) => {
                    const nodeUnlocked = unlockedNodeIds.has(node.id);
                    return (
                      <div key={node.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <span className={nodeUnlocked ? "text-gold-bright" : "text-parchment-dim"}>{node.name}</span>
                          <span className="ml-2 text-parchment-faint">{formatNodeEffect(node.effect, node.magnitudePct)}</span>
                          {node.description && (
                            <span className="ml-2 text-parchment-faint">— {node.description}</span>
                          )}
                        </div>
                        {nodeUnlocked ? (
                          <span className="shrink-0 text-gold-bright">✓</span>
                        ) : (
                          <button
                            onClick={() => unlockNodeMutation.mutate(node.id)}
                            disabled={character.unspentSkillPoints < node.pointCost || unlockNodeMutation.isPending}
                            className="shrink-0 rounded bg-gold px-2 py-0.5 font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Odblokuj ({node.pointCost})
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </PanelFrame>
  );
}
