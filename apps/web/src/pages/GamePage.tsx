import { useParams, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { getCharacter } from "../lib/charactersApi";
import { useCharacterStore } from "../store/characterStore";
import { CharacterTab } from "./game/CharacterTab";
import { EquipmentTab } from "./game/EquipmentTab";
import { ExpeditionsTab } from "./game/ExpeditionsTab";
import { AnvilTab } from "./game/AnvilTab";
import { NpcTab } from "./game/NpcTab";
import { SkillsTab } from "./game/SkillsTab";

type TabKey = "character" | "equipment" | "expeditions" | "anvil" | "npc" | "skills";

export function GamePage() {
  const { tab } = useParams<{ tab?: string }>();
  const characterId = useCharacterStore((s) => s.activeCharacterId);
  const queryClient = useQueryClient();
  const activeTab = (tab as TabKey | undefined) ?? "character";

  const characterQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => getCharacter(characterId!),
    enabled: !!characterId,
  });
  const character = characterQuery.data;

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="text-lg font-semibold text-parchment">{character?.name ?? "…"}</h1>
        {character && (
          <p className="text-sm text-parchment-dim">
            Poziom {character.level} · {character.exp} exp · {character.gold} złota
          </p>
        )}
      </div>

      {character && (
        <div className="mt-4">
          {activeTab === "character" && <CharacterTab character={character} />}
          {activeTab === "equipment" && <EquipmentTab character={character} />}
          {activeTab === "expeditions" && (
            <ExpeditionsTab
              character={character}
              onClaimed={() => queryClient.invalidateQueries({ queryKey: ["character", characterId] })}
            />
          )}
          {activeTab === "anvil" && <AnvilTab character={character} />}
          {activeTab === "npc" && <NpcTab character={character} />}
          {activeTab === "skills" && <SkillsTab character={character} />}
        </div>
      )}
    </AppShell>
  );
}
