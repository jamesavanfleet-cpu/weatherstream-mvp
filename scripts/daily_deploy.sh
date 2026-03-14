#!/bin/bash
# daily_deploy.sh
# VanFleet Wx daily full refresh -- run manually or via Manus
# Steps:
#   1. Generate all region intel briefings (intel.json)
#   2. Generate top story headline + paragraph (top_story.json)
#   3. Rebuild Vite site with VITE_BASE_PATH=/
#   4. Force-push dist/public to gh-pages
#   5. Commit intel.json and top_story.json back to main
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

LOG_FILE="/tmp/vanfleet_daily_deploy.log"
echo "=== VanFleet Wx daily deploy started: $(date -u) ===" | tee "$LOG_FILE"

# ── Step 1: Generate intel.json ───────────────────────────────────────────────
echo "[1/5] Generating intel.json..." | tee -a "$LOG_FILE"
python3 scripts/run_intel.py 2>>/tmp/intel_stderr.log
if [ $? -ne 0 ]; then
  echo "ERROR: intel generation failed" | tee -a "$LOG_FILE"
  cat /tmp/intel_stderr.log | tail -20 | tee -a "$LOG_FILE"
  exit 1
fi
echo "intel.json OK" | tee -a "$LOG_FILE"

# ── Step 2: Generate top_story.json ──────────────────────────────────────────
echo "[2/5] Generating top_story.json..." | tee -a "$LOG_FILE"
python3 scripts/run_top_story.py >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: top_story generation failed" | tee -a "$LOG_FILE"
  exit 1
fi
echo "top_story.json OK" | tee -a "$LOG_FILE"

# ── Step 3: Build the site ────────────────────────────────────────────────────
echo "[3/5] Building site (VITE_BASE_PATH=/)..." | tee -a "$LOG_FILE"
VITE_BASE_PATH=/ pnpm run build:pages >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: build failed" | tee -a "$LOG_FILE"
  exit 1
fi

# Validate build output
if grep -q "weatherstream-mvp" dist/public/index.html; then
  echo "ERROR: index.html has wrong base path. Aborting deploy." | tee -a "$LOG_FILE"
  exit 1
fi
if ! grep -q 'src="/assets/' dist/public/index.html; then
  echo "ERROR: index.html missing /assets/ reference. Aborting deploy." | tee -a "$LOG_FILE"
  exit 1
fi
echo "Build validation passed." | tee -a "$LOG_FILE"

# ── Step 4: Deploy to gh-pages ────────────────────────────────────────────────
echo "[4/5] Deploying to gh-pages..." | tee -a "$LOG_FILE"
DIST_DIR="$REPO_ROOT/dist/public"
REPO_URL=$(git remote get-url origin)
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

git clone --branch gh-pages "$REPO_URL" "$TMPDIR" 2>/dev/null || git clone "$REPO_URL" "$TMPDIR"
cd "$TMPDIR"
git checkout gh-pages 2>/dev/null || git checkout -b gh-pages

# Preserve persistent data files
PRESERVE_FILES="briefing_video.json live_conditions.json cruise_itineraries.json"
for PFILE in $PRESERVE_FILES; do
  if [ -f "$PFILE" ]; then
    cp "$PFILE" "/tmp/deploy_preserve_${PFILE}"
    echo "  Preserved: $PFILE" | tee -a "$LOG_FILE"
  fi
done

# Remove old build artifacts
rm -rf assets *.html *.json

# Copy new build (includes fresh intel.json and top_story.json)
cp -r "$DIST_DIR"/. .

# Restore persistent files -- these always win
for PFILE in $PRESERVE_FILES; do
  if [ -f "/tmp/deploy_preserve_${PFILE}" ]; then
    cp "/tmp/deploy_preserve_${PFILE}" "$PFILE"
    rm "/tmp/deploy_preserve_${PFILE}"
    echo "  Restored: $PFILE" | tee -a "$LOG_FILE"
  fi
done

# Final safety check
if grep -q "weatherstream-mvp" index.html; then
  echo "ERROR: Deployed index.html still has wrong base path. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

git add -A
git commit -m "Daily refresh: $(date -u '+%Y-%m-%d %H:%M UTC')" || echo "Nothing to commit."
git push origin gh-pages --force
echo "gh-pages deploy complete." | tee -a "$LOG_FILE"

# ── Step 5: Commit intel.json and top_story.json back to main ─────────────────
echo "[5/5] Committing intel.json and top_story.json to main..." | tee -a "$LOG_FILE"
cd "$REPO_ROOT"
git add client/public/intel.json client/public/top_story.json
git commit -m "Daily intel + top story refresh: $(date -u '+%Y-%m-%d %H:%M UTC')" || echo "Nothing to commit to main."
git push origin main
echo "main commit complete." | tee -a "$LOG_FILE"

echo "=== VanFleet Wx daily deploy complete: $(date -u) ===" | tee -a "$LOG_FILE"
