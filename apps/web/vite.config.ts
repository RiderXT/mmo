import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Baked into the bundle at build time so the running client can tell whether the server it's
// talking to has since been redeployed — see src/components/UpdateBanner.tsx.
function readGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(readGitCommit()),
  },
  server: {
    port: 5173,
    host: true,
  },
});
