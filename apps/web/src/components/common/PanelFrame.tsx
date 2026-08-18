import type { ReactNode } from "react";
import { PanelCorners } from "./PanelCorners";

/** Ornate "window" panel — titled header + gold corner ornaments + higher contrast against
 * `ink` than the shared `.panel` class. Background is a near-neutral stone grey (oklch chroma
 * 0.006 — deliberately far lower than `ink`/`line`'s already-subtle 0.02–0.035, so it reads as
 * grey rather than brown next to them) rather than a new tailwind.config.js token, kept local
 * here until this replaces `.panel` app-wide.
 *
 * `emphasis="secondary"` is for panels that are supporting detail rather than a primary "room"
 * of the screen (e.g. the selected-item stat readout) — thinner border, smaller/dimmer corners,
 * no heavy drop shadow, so it doesn't visually compete with the panels around it. */
export function PanelFrame({
  title,
  headerRight,
  emphasis = "primary",
  className = "",
  bodyClassName = "",
  children,
}: {
  title: ReactNode;
  /** Optional control (e.g. a close button) pinned to the header's right edge, outside the
   * centered title — the header stays a 3-column grid so the title stays visually centered
   * regardless of whether this is present. */
  headerRight?: ReactNode;
  emphasis?: "primary" | "secondary";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const secondary = emphasis === "secondary";
  return (
    <div
      className={`relative border bg-[oklch(23%_0.006_45)] ${
        secondary ? "border-gold/25 shadow-[0_4px_14px_rgba(0,0,0,0.35)]" : "border-gold/40 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      } ${className}`}
    >
      <PanelCorners size={secondary ? 13 : 20} colorClassName={secondary ? "text-gold/60" : "text-gold"} />
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center border-b px-4 py-2.5 ${
          secondary ? "border-gold/20" : "border-gold/30"
        }`}
      >
        <span />
        <h2
          className={`font-display font-semibold uppercase tracking-[0.18em] text-gold-bright ${
            secondary ? "text-[11px]" : "text-xs"
          }`}
        >
          {title}
        </h2>
        <span className="justify-self-end">{headerRight}</span>
      </div>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
