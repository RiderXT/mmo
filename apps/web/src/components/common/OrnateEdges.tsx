import panelEdge from "../../assets/frames/panel-edge.png";
import panelEdgeVertical from "../../assets/frames/panel-edge-vertical.png";

/** Straight-edge bands connecting the 4 OrnateCorners into an actual continuous frame, instead of
 * corners floating on a plain background. Same source photo the corners came from (a real strip
 * with two thin gold hairlines + an aged-bronze band between, ends trimmed off since the corner
 * art already carries the ornate flourish at the joint — repeating a SECOND ornate motif right
 * where it meets the corner just competed with it). The plain middle tiles seamlessly (verified
 * pixel-diff on the source before cropping in — a chunky organic texture, so "seamless" here
 * means no visible hard seam at the repeat, not a mathematically perfect match).
 *
 * `panel-edge-vertical.png` is a pre-rotated (90°) copy of the same asset — simpler and more
 * robust than rotating the horizontal image with a CSS transform on a repeating background, which
 * would need the container's rendered height at build time to size correctly.
 *
 * Dynamic positioning (depends on `cornerSize`) is inline `style`, not Tailwind arbitrary-value
 * classes — a template-string class like `left-[${cornerSize}px]` is invisible to Tailwind's
 * static content scanner and silently generates no CSS, the same class of bug fixed in
 * tailwind.config.js's color-opacity handling. */
export function OrnateEdges({ cornerSize, thickness, opacity = 1 }: { cornerSize: number; thickness: number; opacity?: number }) {
  const horizontalStyle: React.CSSProperties = {
    left: cornerSize,
    right: cornerSize,
    height: thickness,
    backgroundImage: `url(${panelEdge})`,
    backgroundRepeat: "repeat-x",
    backgroundSize: `auto ${thickness}px`,
    opacity,
  };
  const verticalStyle: React.CSSProperties = {
    top: cornerSize,
    bottom: cornerSize,
    width: thickness,
    backgroundImage: `url(${panelEdgeVertical})`,
    backgroundRepeat: "repeat-y",
    backgroundSize: `${thickness}px auto`,
    opacity,
  };
  return (
    <>
      <div className="pointer-events-none absolute top-0" style={horizontalStyle} />
      <div className="pointer-events-none absolute bottom-0" style={horizontalStyle} />
      <div className="pointer-events-none absolute left-0" style={verticalStyle} />
      <div className="pointer-events-none absolute right-0" style={verticalStyle} />
    </>
  );
}
