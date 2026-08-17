import { useEffect } from "react";

/** Closes a modal/overlay on Escape — the near-universal dismiss convention, and the same
 * behavior ItemContextMenu already implements inline. Pair with a backdrop onClick for
 * click-outside dismissal; this hook only covers the keyboard path. */
export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);
}
