import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { getCharacter } from "../lib/charactersApi";
import { CharacterTab } from "./game/CharacterTab";
import { ExpeditionsTab } from "./game/ExpeditionsTab";

const TABS = [
  { key: "character", label: "Postać" },
  { key: "expeditions", label: "Ekspedycje" },
  { key: "anvil", label: "Kowadło" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function GamePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey | null) ?? TABS[0].key;

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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-parchment">{character?.name ?? "…"}</h1>
        {character && (
          <p className="text-sm text-parchment-dim">
            Poziom {character.level} · {character.exp} exp · {character.gold} złota
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSearchParams({ tab: tab.key })}
            className={`px-3 py-1.5 text-sm transition ${
              tab.key === activeTab ? "bg-gold text-ink" : "text-parchment-dim hover:bg-panel-raised"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {character && (
        <div className="mt-4">
          {activeTab === "character" && <CharacterTab character={character} />}
          {activeTab === "expeditions" && (
            <ExpeditionsTab
              character={character}
              onClaimed={() => queryClient.invalidateQueries({ queryKey: ["character", characterId] })}
            />
          )}
          {activeTab === "anvil" && (
            <p className="text-sm text-parchment-faint">Kowadło — wkrótce.</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
