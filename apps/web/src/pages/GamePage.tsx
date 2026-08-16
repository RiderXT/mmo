import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { getCharacter } from "../lib/charactersApi";
import { CharacterTab } from "./game/CharacterTab";
import { EquipmentTab } from "./game/EquipmentTab";
import { ExpeditionsTab } from "./game/ExpeditionsTab";
import { AnvilTab } from "./game/AnvilTab";
import { NpcTab } from "./game/NpcTab";

type TabKey = "character" | "equipment" | "expeditions" | "anvil" | "npc";

export function GamePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey | null) ?? "character";

  const characterQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => getCharacter(characterId!),
    enabled: !!characterId,
  });
  const character = characterQuery.data;

  if (!characterId) {
    return (
      <AppShell>
        <p className="text-parchment-dim">Wybierz postać z listy.</p>
      </AppShell>
    );
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
        </div>
      )}
    </AppShell>
  );
}
