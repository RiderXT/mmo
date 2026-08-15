import { execSync } from "node:child_process";

/**
 * Identifies the currently-deployed build so the frontend can detect when a newer one has
 * been rolled out (see apps/web/src/components/UpdateBanner.tsx) and prompt the player to
 * refresh — deploy.sh always does `git pull` before restarting the service, so the commit
 * HEAD was on at server startup *is* the deployed version, no extra bookkeeping needed.
 */
function readGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export const APP_VERSION = readGitCommit();
