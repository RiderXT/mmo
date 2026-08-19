import { useState } from "react";
import type { Character } from "@mmo/shared";
import { SkillsPanel } from "../../components/character/SkillsPanel";
import { PassiveSkillsPanel } from "../../components/character/PassiveSkillsPanel";

type SubTab = "character" | "passive";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "character", label: "Umiejętności postaci" },
  { key: "passive", label: "Umiejętności pasywne" },
];

export function SkillsTab({ character }: { character: Character }) {
  const [subTab, setSubTab] = useState<SubTab>("character");

  return (
    <div>
      <div className="flex gap-2 border-b border-line pb-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              subTab === t.key
                ? "bg-gold text-ink"
                : "text-parchment-dim hover:bg-panel-raised hover:text-parchment"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {subTab === "character" ? (
          <SkillsPanel character={character} />
        ) : (
          <PassiveSkillsPanel characterId={character.id} />
        )}
      </div>
    </div>
  );
}
