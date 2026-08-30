import { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export type TargetableBookEffect = "reset_book_cooldown" | "boost_next_book_chance" | "reset_class_skill_books";

const TITLES: Record<TargetableBookEffect, string> = {
  reset_book_cooldown: "Resetuj odnowienie książki",
  boost_next_book_chance: "Zwiększ szansę na następne czytanie",
  reset_class_skill_books: "Zresetuj postęp książek umiejętności",
};

const DESCRIPTIONS: Record<TargetableBookEffect, string> = {
  reset_book_cooldown: "natychmiast zniesie odnowienie wybranej książki, pozwalając przeczytać ją ponownie już teraz.",
  boost_next_book_chance: "zwiększy szansę powodzenia przy najbliższym czytaniu wybranej książki.",
  reset_class_skill_books: "zresetuje postęp z książek dla wybranej umiejętności z powrotem do poziomu odblokowanego punktami — pozwoli spróbować innej kombinacji książek.",
};

/** Opened instead of firing "Użyj" immediately for the 3 book-utility potion effects, which
 * (unlike buff_exp/gold/drop — global, no target) each need the player to pick a target: a
 * specific book stack for the first two, a book-gated class skill for the third. Mirrors
 * PotionThresholdModal's structure/styling. */
export function UseOnTargetModal({
  itemName,
  effect,
  options,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  effect: TargetableBookEffect;
  options: { id: string; label: string }[];
  onConfirm: (targetId: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  useEscapeKey(onCancel);

  const pickerLabel = effect === "reset_class_skill_books" ? "Umiejętność" : "Książka";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm panel p-4">
        <h2 className="font-medium text-parchment">{TITLES[effect]}</h2>
        <p className="mt-2 text-sm text-parchment-dim">
          <span className="font-medium text-parchment">{itemName}</span> {DESCRIPTIONS[effect]}
        </p>
        {options.length === 0 ? (
          <p className="mt-4 text-sm text-red-400">Brak dostępnych celów.</p>
        ) : (
          <label className="mt-4 block text-sm text-parchment-dim">
            {pickerLabel}
            <select
              className="mt-1.5 w-full border border-line-soft bg-panel-raised px-3 py-2 text-sm text-parchment"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Anuluj
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-30"
          >
            Użyj
          </button>
        </div>
      </div>
    </div>
  );
}
