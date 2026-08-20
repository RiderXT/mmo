import type { ReactNode } from "react";
import { PanelCorners } from "./PanelCorners";
import { OrnateCorners } from "./OrnateCorners";

/** Ornate "window" panel — titled header + gold corner ornaments. Uses the shared `panel`
 * token (tailwind.config.js) for its background — a near-neutral stone grey (oklch chroma
 * 0.006, far lower than `ink`/`line`'s already-subtle 0.02–0.035, so it reads as grey rather
 * than brown next to them). `.panel` (index.css) uses the same token, so any remaining plain
 * `.panel` divs (modals, admin pages) already match this automatically.
 *
 * `emphasis="secondary"` is for panels that are supporting detail rather than a primary "room"
 * of the screen (e.g. the selected-item stat readout) — thinner border, smaller/dimmer corners,
 * no heavy drop shadow, so it doesn't visually compete with the panels around it.
 *
 * `cornerStyle="ornate"` swaps in OrnateCorners (real engraved-gold corner art) — opt-in per
 * surface (currently just the expedition map) rather than the app-wide default. No plain CSS
 * `border` line at all here (tried keeping one, twice): a hairline line has nowhere near the
 * visual weight of the chunky engraved bracket art, so wherever they'd need to meet — the corner,
 * or the art's own transparent gaps — they read as two different frames stapled together, not
 * one. The corner art alone (plus `bg-panel` giving the panel body a real edge against `ink`)
 * carries the framing; this is the same "corners only, no continuous line" treatment already used
 * for item sockets (see inventory/SocketCorners.tsx). */
export function PanelFrame({
  title,
  headerRight,
  emphasis = "primary",
  cornerStyle = "standard",
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
  cornerStyle?: "standard" | "ornate";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const secondary = emphasis === "secondary";
  const ornate = cornerStyle === "ornate";
  return (
    <div
      className={`relative bg-panel ${ornate ? "" : "border"} ${
        secondary
          ? `${ornate ? "" : "border-gold/25"} shadow-[0_4px_14px_rgba(0,0,0,0.35)]`
          : `${ornate ? "" : "border-gold/40"} shadow-[0_8px_24px_rgba(0,0,0,0.5)]`
      } ${className}`}
    >
      {ornate ? (
        <OrnateCorners size={secondary ? 56 : 84} opacity={secondary ? 0.6 : 1} />
      ) : (
        <PanelCorners size={secondary ? 13 : 20} colorClassName={secondary ? "text-gold/60" : "text-gold"} />
      )}
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
