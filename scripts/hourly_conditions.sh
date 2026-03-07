#!/bin/bash
# Hourly live conditions update -- runs at :10 past every hour
# Fetches fresh current conditions for all 68 ports and deploys to gh-pages

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

LOG_FILE="/tmp/vanfleet_hourly.log"
echo "=== Hourly conditions update: $(date -u) ===" | tee -a "$LOG_FILE"

# 1. Fetch fresh live conditions
echo "Fetching live conditions for all ports..." | tee -a "$LOG_FILE"
python3 scripts/generate_live_conditions.py >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: live conditions fetch failed" | tee -a "$LOG_FILE"
  exit 1
fi

# 2. Copy to dist/public (no rebuild needed -- just update the JSON)
cp client/public/live_conditions.json dist/public/live_conditions.json 2>/dev/null || true

# 3. Push updated JSON to gh-pages (no full rebuild -- just update the file)
DEPLOY_DIR="/tmp/gh-pages-deploy"
cd "$DEPLOY_DIR"
git fetch origin gh-pages
git reset --hard origin/gh-pages

cp "$REPO_ROOT/client/public/live_conditions.json" .

git add live_conditions.json
# Only commit and push if there are actual changes
if git diff --cached --quiet; then
  echo "No changes to live_conditions.json, skipping push." | tee -a "$LOG_FILE"
else
  git commit -m "Hourly conditions: $(date -u '+%Y-%m-%d %H:%M UTC')"
  git push origin gh-pages --force
  echo "Pushed live_conditions.json to gh-pages" | tee -a "$LOG_FILE"
fi

echo "=== Hourly update complete: $(date -u) ===" | tee -a "$LOG_FILE"
