import cornerArt from "../../assets/frames/socket-corner.png";

/** Corner bracket for item sockets (equip slots, inventory grid, active-item slots, anvil slot).
 * Real AI-generated asset (user-provided, a thin bronze/gold picture-frame corner with a small
 * leaf ornament) — a second attempt after common/OrnateCorners' more intricate engraved artwork
 * was tried here first and reverted: at these ~56px squares that detailed asset rendered as a
 * muddy blob, confirmed by compositing it at actual display size before shipping. This asset is
 * thin-lined instead of densely engraved, so it stays legible far smaller — verified the same way
 * before wiring in.
 *
 * Mirrored (scaleX/scaleY), not rotated — the source is one corner of a rectangular frame with
 * straight border lines running along its right and bottom edges; a 90°/180° rotation would spin
 * those lines to point the wrong way, while mirroring keeps every edge's line running along that
 * edge at all 4 corners. */
export function SocketCorners({ size = 20 }: { size?: number }) {
  const style = { width: size, height: size };
  return (
    <>
      <img src={cornerArt} alt="" className="pointer-events-none absolute -left-px -top-px" style={style} />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -right-px -top-px"
        style={{ ...style, transform: "scaleX(-1)" }}
      />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -bottom-px -right-px"
        style={{ ...style, transform: "scale(-1, -1)" }}
      />
      <img
        src={cornerArt}
        alt=""
        className="pointer-events-none absolute -bottom-px -left-px"
        style={{ ...style, transform: "scaleY(-1)" }}
      />
    </>
  );
}
