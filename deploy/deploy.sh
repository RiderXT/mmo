#!/usr/bin/env bash
# Run on the VPS, inside the repo directory (e.g. /var/www/mmo), to pull and
# apply an update. Usage: ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

git pull
pnpm install
pnpm --filter @mmo/api prisma:generate:prod
pnpm --filter @mmo/api prisma:push:prod
pnpm --filter @mmo/api build
pnpm --filter @mmo/web build
sudo systemctl restart mmo-api

echo "Deployed. Tail logs with: journalctl -u mmo-api -f"
