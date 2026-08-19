import { useEffect, useState } from "react";
import type { Character } from "@mmo/shared";

interface BuffDef {
  key: "exp" | "gold" | "drop";
  label: string;
  multiplier: number | null;
  until: string | null;
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Small pill row showing the character's active personal exp/gold/drop buffs (see
 * EquipmentTab's "Użyj" action / apps/api's useBuffItem) with a live mm:ss countdown to
 * expiry. Renders nothing when no buff is active. Mounted in AppShell so it's visible on every
 * character-scoped page, not just the Equipment tab — reuses whatever `character` the caller
 * already has in scope. */
export function ActiveBuffsBar({ character }: { character: Character }) {
  // Ticks once a second purely to force a re-render of the countdown text below — this is a
  // low-traffic UI, a per-second re-render is cheap.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const allBuffs: BuffDef[] = [
    { key: "exp", label: "EXP", multiplier: character.expBuffMultiplier, until: character.expBuffUntil },
    { key: "gold", label: "Złoto", multiplier: character.goldBuffMultiplier, until: character.goldBuffUntil },
    { key: "drop", label: "Łup", multiplier: character.dropBuffMultiplier, until: character.dropBuffUntil },
  ];
  const buffs = allBuffs.filter((b) => b.multiplier != null && b.until != null && new Date(b.until).getTime() > now);

  if (buffs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {buffs.map((b) => (
        <span
          key={b.key}
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold-bright"
          title={`${b.label} x${b.multiplier} jeszcze przez ${formatCountdown(new Date(b.until!).getTime() - now)}`}
        >
          {b.label} x{b.multiplier} · {formatCountdown(new Date(b.until!).getTime() - now)}
        </span>
      ))}
    </div>
  );
}
