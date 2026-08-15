import { useEffect, useState } from "react";
import { getAppVersion } from "../lib/versionApi";

const BUILD_VERSION = __APP_VERSION__;
const CHECK_INTERVAL_MS = 60_000;

/** Polls /api/version and shows a "refresh to update" banner once the server reports a commit
 * different from the one this bundle was built from — i.e. someone ran deploy.sh since this
 * tab loaded. Mounted once inside AppShell, so it's visible everywhere the game is played. */
export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // No git repo at build/runtime (e.g. some sandboxed environment) — nothing reliable to
    // compare against, don't show false positives.
    if (BUILD_VERSION === "unknown") return;

    let cancelled = false;
    async function check() {
      try {
        const { version } = await getAppVersion();
        if (!cancelled && version !== "unknown" && version !== BUILD_VERSION) {
          setUpdateAvailable(true);
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-gold/50 bg-ink/95 px-4 py-3 text-sm text-parchment shadow-lg backdrop-blur">
      <span>Wyszła nowa wersja gry — odśwież, żeby zobaczyć zmiany.</span>
      <button
        onClick={() => window.location.reload()}
        className="bg-gold px-3 py-1.5 font-medium text-ink hover:bg-gold-bright"
      >
        Odśwież
      </button>
    </div>
  );
}
