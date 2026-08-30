import { useQuery } from "@tanstack/react-query";
import { listPassiveSkills } from "../../lib/passiveSkillsApi";
import { PanelFrame } from "../common/PanelFrame";
import { ProgressBar } from "../common/ProgressBar";

const GATHER_KIND_LABELS: Record<string, string> = {
  fishing: "łowienia",
  mining: "wydobycia w kopalniach",
};

export function PassiveSkillsPanel({ characterId }: { characterId: string }) {
  const skillsQuery = useQuery({
    queryKey: ["passive-skills", characterId],
    queryFn: () => listPassiveSkills(characterId),
  });

  const skills = skillsQuery.data ?? [];

  return (
    <PanelFrame title="Umiejętności pasywne">
      <p className="text-sm text-parchment-faint">
        Nie przydziela się w nie punktów. Umiejętności związane z łowieniem/kopaniem rosną z
        doświadczenia zdobywanego podczas zbieractwa; pozostałe (i wyższe poziomy tych pierwszych,
        jeśli ustawiona jest bramka) rosną przez czytanie odpowiednich książek (prawy klik na
        książce w plecaku → Przeczytaj) — każda próba ma szansę na sukces i zużywa jedną sztukę.
      </p>
      {skills.length === 0 ? (
        <p className="mt-3 text-sm text-parchment-faint">Brak zdefiniowanych umiejętności pasywnych.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {skills.map((skill) => {
            const pct = skill.maxLevel > 0 ? (skill.level / skill.maxLevel) * 100 : 0;
            const gatherLabel = skill.gatherKind ? GATHER_KIND_LABELS[skill.gatherKind] ?? skill.gatherKind : null;
            // Book bonuses accumulate independently of the level*perLevel formula (each book grants
            // its own fixed amount — see CharacterPassiveSkill.bookChanceBonus/bookSpeedBonus) —
            // shown as one combined total, the player doesn't need the XP-vs-book split.
            const chanceBonus = Math.round((skill.level * skill.chanceBonusPerLevel + skill.bookChanceBonus) * 1000) / 10;
            const speedBonus = Math.round((skill.level * skill.speedBonusPerLevel + skill.bookSpeedBonus) * 1000) / 10;
            const nextLevel = skill.level + 1;
            const gated =
              skill.gatherKind != null && skill.bookGateFromLevel != null && nextLevel >= skill.bookGateFromLevel;
            const booksRequired = skill.bookRequirements.find((r) => r.level === nextLevel)?.booksRequired ?? skill.booksRequiredPerLevel;
            const xpPct = skill.xpPerLevel > 0 ? (skill.xp / skill.xpPerLevel) * 100 : 0;
            const xpReady = skill.xp >= skill.xpPerLevel;
            return (
              <div key={skill.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-parchment">{skill.name}</span>
                  <span className="tabular-nums text-parchment-dim">
                    {skill.level}/{skill.maxLevel}
                  </span>
                </div>
                {skill.description && <p className="text-xs text-parchment-faint">{skill.description}</p>}
                <div className="mt-1">
                  <ProgressBar pct={pct} />
                </div>
                {skill.gatherKind && skill.level < skill.maxLevel && (
                  <div className="mt-1">
                    <div className="flex items-baseline justify-between text-[11px] text-parchment-faint">
                      <span>XP do następnego poziomu</span>
                      <span className="tabular-nums">
                        {skill.xp}/{skill.xpPerLevel}
                      </span>
                    </div>
                    <ProgressBar pct={xpPct} />
                  </div>
                )}
                {gated && xpReady && skill.level < skill.maxLevel && (
                  <p className="mt-1 text-xs text-gold-bright">
                    Gotowe do awansu — przeczytaj jeszcze {booksRequired - skill.pendingBooksRead}{" "}
                    {booksRequired - skill.pendingBooksRead === 1 ? "książkę" : "książki"} (
                    {skill.pendingBooksRead}/{booksRequired}).
                  </p>
                )}
                {gatherLabel && (skill.chanceBonusPerLevel > 0 || skill.speedBonusPerLevel > 0) && (
                  <p className="mt-1 text-xs text-parchment-faint">
                    Aktualny bonus do {gatherLabel}:
                    {skill.chanceBonusPerLevel > 0 && ` +${chanceBonus}% szansy`}
                    {skill.chanceBonusPerLevel > 0 && skill.speedBonusPerLevel > 0 && ","}
                    {skill.speedBonusPerLevel > 0 && ` +${speedBonus}% szybkości`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
