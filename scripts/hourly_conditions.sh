#!/bin/bash
# Hourly live conditions update -- runs at :10 past every hour
# Fetches fresh current conditions for all 68 ports AND NHC storm data,
# then deploys both to gh-pages. NHC advisories are issued at 11 AM, 2 PM,
# 5 PM, 8 PM, 11 PM, 2 AM, 5 AM, and 8 AM EDT -- running this every hour
# ensures the site reflects any new advisory within 60 minutes of release.

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

# 2. Fetch fresh NHC storm data (names, classifications, tracks, cones)
echo "Fetching NHC storm data..." | tee -a "$LOG_FILE"
python3 scripts/generate_nhc_data.py >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "WARNING: NHC data fetch failed -- continuing with old data" | tee -a "$LOG_FILE"
fi

# 3. Copy to dist/public (no rebuild needed -- just update the JSONs)
cp client/public/live_conditions.json dist/public/live_conditions.json 2>/dev/null || true
cp client/public/nhc_data.json dist/public/nhc_data.json 2>/dev/null || true

# 4. Push updated JSONs to gh-pages (no full rebuild -- just update the files)
DEPLOY_DIR="/tmp/gh-pages-deploy"
cd "$DEPLOY_DIR"
git fetch origin gh-pages
git reset --hard origin/gh-pages

cp "$REPO_ROOT/client/public/live_conditions.json" .
cp "$REPO_ROOT/client/public/nhc_data.json" .

git add live_conditions.json nhc_data.json
# Only commit and push if there are actual changes
if git diff --cached --quiet; then
  echo "No changes to push, skipping." | tee -a "$LOG_FILE"
else
  git commit -m "Hourly conditions: $(date -u '+%Y-%m-%d %H:%M UTC')"
  git push origin gh-pages --force
  echo "Pushed live_conditions.json and nhc_data.json to gh-pages" | tee -a "$LOG_FILE"
fi

echo "=== Hourly update complete: $(date -u) ===" | tee -a "$LOG_FILE"
