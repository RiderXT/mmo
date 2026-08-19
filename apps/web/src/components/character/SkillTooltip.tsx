import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { SocketCorners } from "../inventory/SocketCorners";

// Same fixed-width, above/below-fallback positioning as inventory/ItemTooltip.tsx — kept as a
// separate component (not a generalized shared one) since skill content shape (status/effect
// lines instead of stat deltas) doesn't map cleanly onto the item version's props.
const TOOLTIP_WIDTH = 224; // w-56
const TOOLTIP_GAP = 8;
const TOOLTIP_HEIGHT_ESTIMATE = 200;

export function SkillTooltip({
  title,
  kindLabel,
  status,
  description,
  effectLines = [],
  costLabel,
  locked,
  children,
}: {
  title: string;
  kindLabel: string;
  status: string;
  description?: string;
  effectLines?: string[];
  costLabel?: string | null;
  locked: boolean;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  function reveal(e: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, TOOLTIP_GAP),
      window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_GAP,
    );
    if (rect.top >= TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_GAP) {
      setPosition({ left, bottom: window.innerHeight - rect.top + TOOLTIP_GAP });
    } else {
      setPosition({ left, top: rect.bottom + TOOLTIP_GAP });
    }
  }

  return (
    <div onMouseEnter={reveal} onMouseLeave={() => setPosition(null)} onFocus={reveal} onBlur={() => setPosition(null)}>
      {children}
      {position && (
        <div
          style={{ left: position.left, top: position.top, bottom: position.bottom }}
          className={`pointer-events-none fixed z-50 w-56 border p-3 text-center text-xs shadow-lg backdrop-blur-sm ${
            locked ? "border-line-soft/40 bg-[oklch(23%_0.006_45_/_0.88)]" : "border-gold/25 bg-[oklch(23%_0.006_45_/_0.88)]"
          }`}
        >
          <SocketCorners size={12} />
          <p className="font-display text-sm font-semibold text-gold-bright">{title}</p>
          <p className="mt-1 text-parchment-faint">{kindLabel}</p>
          <p className={locked ? "text-parchment-faint" : "text-parchment-dim"}>{status}</p>
          {description && <p className="mt-1 text-parchment-faint">{description}</p>}
          {effectLines.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-gold/20 pt-2">
              {effectLines.map((line, i) => (
                <p key={i} className="text-parchment-dim">
                  {line}
                </p>
              ))}
            </div>
          )}
          {costLabel && <p className="mt-2 text-gold-bright">{costLabel}</p>}
        </div>
      )}
    </div>
  );
}
