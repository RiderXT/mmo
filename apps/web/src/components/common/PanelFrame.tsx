import type { ReactNode } from "react";
import { PanelCorners } from "./PanelCorners";
import { OrnateCorners } from "./OrnateCorners";
import { OrnateEdges } from "./OrnateEdges";
// Stone-texture fill (panel-fill.png) intentionally not wired in yet — the source file the user
// sent got overwritten by their bg-removal tool reusing the same filename before it was copied
// in here; waiting on a re-send. Corners + edges below don't depend on it.

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
 * `cornerStyle="ornate"` swaps in OrnateCorners (real engraved-gold corner art) and OrnateEdges
 * (matching straight bands connecting them into an actual frame — see OrnateEdges.tsx for why a
 * plain CSS `border` line never worked here, tried twice) — opt-in per surface (currently just
 * the expedition map) rather than the app-wide default. Tiled stone-texture fill (replacing flat
 * `bg-panel`) is planned but not wired in yet — see OrnateEdges.tsx's sibling note. */
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
  const cornerSize = secondary ? 56 : 84;
  // Roughly matches the corner art's own arm thickness at that display size, so the edge band
  // doesn't visibly jump in weight where it meets the corner.
  const edgeThickness = secondary ? 11 : 16;
  return (
    <div
      className={`relative bg-panel ${ornate ? "" : "border"} ${
        secondary
          ? `${ornate ? "" : "border-gold/25"} shadow-[0_4px_14px_rgba(0,0,0,0.35)]`
          : `${ornate ? "" : "border-gold/40"} shadow-[0_8px_24px_rgba(0,0,0,0.5)]`
      } ${className}`}
    >
      {ornate ? (
        <>
          <OrnateEdges cornerSize={cornerSize} thickness={edgeThickness} opacity={secondary ? 0.7 : 1} />
          <OrnateCorners size={cornerSize} opacity={secondary ? 0.6 : 1} />
        </>
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
