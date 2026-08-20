import cornerArt from "../../assets/frames/corner-ornate.png";

/** Heavier, more ornate sibling of PanelCorners — a real hand-authored engraved gold corner
 * ornament (AI-generated per the game's "Torchlit Arena Ledger" prompt in docs/karty-wzor.md,
 * background removed, trimmed to its content bounding box), placed at all four corners via CSS
 * rotation of the single top-left asset. Scoped to surfaces that want to closely match a
 * heavily-framed reference (currently just the expedition map) — PanelCorners (plain inline-SVG
 * brackets) stays the app-wide default. Was a hand-drawn SVG bracket before this asset existed;
 * a screenshot alone can only ever be approximated in CSS, this real PNG reproduces the
 * reference 1:1 instead. */
export function OrnateCorners({ size = 34, opacity = 1 }: { size?: number; opacity?: number }) {
  const style = { width: size, height: size, opacity };
  return (
    <>
      <img src={cornerArt} alt="" className="pointer-events-none absolute -left-px -top-px" style={style} />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -right-px -top-px rotate-90"
        style={style}
      />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -bottom-px -right-px rotate-180"
        style={style}
      />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -bottom-px -left-px -rotate-90"
        style={style}
      />
    </>
  );
}
