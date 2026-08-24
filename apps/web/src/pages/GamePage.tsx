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
import { DailyLoginTab } from "./game/DailyLoginTab";
import { WorldMapTab } from "./game/WorldMapTab";

type TabKey = "character" | "equipment" | "expeditions" | "anvil" | "npc" | "skills" | "daily-login" | "world-map";

// Same labels as the nav links in AppShell.tsx — this just repeats which tab you're on, not the
// character's stats (name/level/exp/gold already live in AppShell's persistent CharacterHeaderBar,
// visible on every page, so repeating them here on every single tab was pure duplication).
const TAB_LABELS: Record<TabKey, string> = {
  character: "Postać",
  equipment: "Ekwipunek",
  expeditions: "Ekspedycje",
  "world-map": "Mapa świata",
  anvil: "Kowadło",
  npc: "NPC",
  skills: "Umiejętności",
  "daily-login": "Nagrody dzienne",
};

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
      <div className="border-b border-line pb-3 text-center">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.15em] text-gold-bright">
          {TAB_LABELS[activeTab]}
        </h1>
      </div>

      {character && (
        <div className="mt-4">
          {activeTab === "character" && <CharacterTab character={character} />}
          {activeTab === "equipment" && <EquipmentTab character={character} />}
          {activeTab === "world-map" && <WorldMapTab character={character} />}
          {activeTab === "expeditions" && (
            <ExpeditionsTab
              character={character}
              onClaimed={() => queryClient.invalidateQueries({ queryKey: ["character", characterId] })}
            />
          )}
          {activeTab === "anvil" && <AnvilTab character={character} />}
          {activeTab === "npc" && <NpcTab character={character} />}
          {activeTab === "skills" && <SkillsTab character={character} />}
          {activeTab === "daily-login" && <DailyLoginTab character={character} />}
        </div>
      )}
    </AppShell>
  );
}
