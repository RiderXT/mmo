import type { Character } from "@mmo/shared";
import { expForLevel } from "@mmo/shared";

function formatCompact(n: number) {
  return new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "No artwork yet" backdrop — same repeating-stripe convention as CharactersPage's
 * PortraitBackdrop (plain, not a fake image), just smaller since this sits beside text
 * instead of filling a whole card. */
function PortraitPlaceholder() {
  return (
    <div
      className="h-20 w-20 shrink-0 border border-line-soft"
      style={{
        backgroundColor: "oklch(23% 0.006 45)",
        backgroundImage:
          "repeating-linear-gradient(125deg, oklch(23% 0.006 45) 0px, oklch(23% 0.006 45) 10px, oklch(28% 0.007 45) 10px, oklch(28% 0.007 45) 20px)",
      }}
    />
  );
}

/** Portrait + title, EXP bar and gold — mirrors the Claude Design mockup's Character Sheet
 * header block. There's no player-title system in this game yet, so "MISTRZ PVP" and the
 * "wybierz tytuł" hint are the mockup's own placeholder content, rendered as static text
 * (no onClick) rather than a button that would promise a feature that doesn't exist. */
export function CharacterSheetHeader({ character }: { character: Character }) {
  const levelFloor = expForLevel(character.level);
  const levelSpan = Math.max(1, expForLevel(character.level + 1) - levelFloor);
  const expIntoLevel = Math.min(levelSpan, Math.max(0, character.exp - levelFloor));
  const pct = Math.min(100, Math.max(0, (expIntoLevel / levelSpan) * 100));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <PortraitPlaceholder />
        <div className="flex-1 text-center">
          <p className="font-display text-sm tracking-[0.15em] text-gold-bright [text-shadow:0_0_12px_rgba(201,162,74,0.4)]">
            MISTRZ PVP
          </p>
          <p className="mt-1 text-xs italic text-parchment-faint">(Wybierz wyświetlany tytuł)</p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between font-display text-[11px] tracking-[0.15em] text-parchment-dim">
          <span>DOŚWIADCZENIE</span>
          <span className="tabular-nums">
            {Math.round(pct)}% · {formatCompact(expIntoLevel)}/{formatCompact(levelSpan)}
          </span>
        </div>
        <div className="h-3.5 overflow-hidden border border-line-soft bg-ink">
          <div className="h-full bg-gradient-to-r from-mp to-mp-bright" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] tracking-[0.15em] text-parchment-dim">ZŁOTO</span>
        <span className="font-display text-sm tabular-nums text-gold-bright">{character.gold.toLocaleString("pl-PL")}</span>
      </div>
    </div>
  );
}
