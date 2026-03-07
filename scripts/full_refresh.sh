#!/bin/bash
# Full forecast refresh -- runs at 8:30 UTC and 20:30 UTC daily
# Regenerates: intel.json, top_story.json
# Then rebuilds the site and deploys to gh-pages

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

LOG_FILE="/tmp/vanfleet_full_refresh.log"
echo "=== Full refresh started: $(date -u) ===" | tee -a "$LOG_FILE"

# 1. Generate fresh intel for all regions
echo "Generating intel.json..." | tee -a "$LOG_FILE"
python3 scripts/generate_intel.py > client/public/intel.json 2>>/tmp/intel_stderr.log
if [ $? -ne 0 ]; then
  echo "ERROR: intel generation failed" | tee -a "$LOG_FILE"
  exit 1
fi
echo "intel.json OK" | tee -a "$LOG_FILE"

# 2. Generate fresh top story
echo "Generating top_story.json..." | tee -a "$LOG_FILE"
python3 scripts/generate_top_story.py >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: top_story generation failed" | tee -a "$LOG_FILE"
  exit 1
fi
echo "top_story.json OK" | tee -a "$LOG_FILE"

# 3. Build the site
echo "Building site..." | tee -a "$LOG_FILE"
VITE_BASE_PATH=/ pnpm run build:pages >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: build failed" | tee -a "$LOG_FILE"
  exit 1
fi

# 4. Validate build
if grep -q "weatherstream-mvp" dist/public/index.html; then
  echo "ERROR: index.html has wrong base path. Aborting deploy." | tee -a "$LOG_FILE"
  exit 1
fi
if ! grep -q 'src="/assets/' dist/public/index.html; then
  echo "ERROR: index.html missing /assets/ reference. Aborting deploy." | tee -a "$LOG_FILE"
  exit 1
fi
echo "Build validation passed." | tee -a "$LOG_FILE"

# 5. Deploy to gh-pages
echo "Deploying to gh-pages..." | tee -a "$LOG_FILE"
DEPLOY_DIR="/tmp/gh-pages-deploy"

cd "$DEPLOY_DIR"
git fetch origin gh-pages
git reset --hard origin/gh-pages

# Copy all built files
rm -rf assets *.html
cp -r "$REPO_ROOT/dist/public/assets" .
cp "$REPO_ROOT/dist/public/index.html" .
cp "$REPO_ROOT/dist/public/404.html" .
cp "$REPO_ROOT/dist/public/intel.json" .
cp "$REPO_ROOT/dist/public/top_story.json" .
[ -f "$REPO_ROOT/dist/public/james-headshot.png" ] && cp "$REPO_ROOT/dist/public/james-headshot.png" .
# Also copy live_conditions.json if it exists
[ -f "$REPO_ROOT/dist/public/live_conditions.json" ] && cp "$REPO_ROOT/dist/public/live_conditions.json" .

# Final validation before push
if grep -q "weatherstream-mvp" index.html; then
  echo "ERROR: Deployed index.html still has wrong base path. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

git add -A
git commit -m "Full refresh: $(date -u '+%Y-%m-%d %H:%M UTC')"
git push origin gh-pages --force

echo "=== Full refresh complete: $(date -u) ===" | tee -a "$LOG_FILE"
