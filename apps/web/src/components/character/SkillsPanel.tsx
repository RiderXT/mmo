import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { getPlayerClass } from "../../lib/classesApi";
import { allocateSkill, getCharacterSkills } from "../../lib/charactersApi";
import { ApiError } from "../../lib/apiClient";

export function SkillsPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient();

  const classQuery = useQuery({
    queryKey: ["class", character.classId],
    queryFn: () => getPlayerClass(character.classId!),
    enabled: !!character.classId,
  });

  const skillsQuery = useQuery({
    queryKey: ["character-skills", character.id],
    queryFn: () => getCharacterSkills(character.id),
  });

  const mutation = useMutation({
    mutationFn: (classSkillId: string) => allocateSkill(character.id, classSkillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["character-skills", character.id] });
      queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : "Nie udało się przydzielić punktu"),
  });

  if (!character.classId || !classQuery.data) return null;

  const levelByClassSkillId = new Map(skillsQuery.data?.map((s) => [s.classSkillId, s.level]) ?? []);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-100">Umiejętności ({classQuery.data.name})</h2>
        <span className="text-xs text-slate-400">
          Niewydane punkty: <span className="text-amber-300">{character.unspentSkillPoints}</span>
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {classQuery.data.skills.map((skill) => {
          const level = levelByClassSkillId.get(skill.id) ?? 0;
          const maxed = level >= skill.maxLevel;
          return (
            <div key={skill.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="text-slate-300">{skill.name}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {skill.kind === "active" ? `aktywna, cd ${skill.cooldownSeconds}s` : "pasywna"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-slate-200">
                  {level}/{skill.maxLevel}
                </span>
                <button
                  onClick={() => mutation.mutate(skill.id)}
                  disabled={character.unspentSkillPoints < 1 || maxed || mutation.isPending}
                  className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
