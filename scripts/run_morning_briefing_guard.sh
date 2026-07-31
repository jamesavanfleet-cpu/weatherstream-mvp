#!/usr/bin/env bash
# Morning briefing guard for the independent 4:00 AM and 4:45 AM Eastern runs.
# It makes a bounded public-artifact check first. If today's briefing is already
# healthy, it exits without generating or deploying. If it is stale or incomplete,
# it runs the existing canonical generator/deployment script once, then verifies
# the public artifacts again with a bounded retry window.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/tmp/vanfleet_morning_briefing_guard.log"
LOCK_FILE="${TMPDIR:-/tmp}/vanfleet_morning_briefing_guard.lock"
CHECKER=(python3 "$REPO_ROOT/scripts/check_public_briefing_freshness.py" --timeout 10)

cd "$REPO_ROOT"

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: required single-run guard utility is unavailable" | tee -a "$LOG_FILE"
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -w 30 9; then
  echo "ERROR: another morning briefing run is still active; no duplicate generation was started." | tee -a "$LOG_FILE"
  exit 1
fi

echo "=== Morning briefing guard started: $(date -u) ===" | tee -a "$LOG_FILE"

if "${CHECKER[@]}"; then
  echo "Public briefing is already current. No generation or deployment was needed." | tee -a "$LOG_FILE"
  exit 0
fi

echo "Public briefing is stale or incomplete. Preparing a clean current-main recovery checkout." | tee -a "$LOG_FILE"
REPO_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
RECOVERY_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/vanfleet_morning_briefing_recovery.XXXXXX")"
cleanup_recovery() {
  rm -rf "$RECOVERY_ROOT"
}
trap cleanup_recovery EXIT

echo "Cloning current main into an isolated recovery checkout." | tee -a "$LOG_FILE"
git clone --branch main --single-branch "$REPO_URL" "$RECOVERY_ROOT" >> "$LOG_FILE" 2>&1

echo "Installing the locked recovery dependencies." | tee -a "$LOG_FILE"
(
  cd "$RECOVERY_ROOT"
  pnpm install --frozen-lockfile
) >> "$LOG_FILE" 2>&1

echo "Starting the canonical daily deployment from the isolated recovery checkout." | tee -a "$LOG_FILE"
bash "$RECOVERY_ROOT/scripts/daily_deploy.sh"

echo "Waiting for the public deployment to become visible, with a bounded retry window." | tee -a "$LOG_FILE"
"${CHECKER[@]}" --attempts 5 --delay-seconds 10

echo "=== Morning briefing guard verified fresh public artifacts: $(date -u) ===" | tee -a "$LOG_FILE"
