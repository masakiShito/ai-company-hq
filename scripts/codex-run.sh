#!/usr/bin/env bash
# エンジニア（Codex）に仕事を依頼する唯一の窓口。
# usage: scripts/codex-run.sh <issue番号> <worktreeの絶対パス> <指示ファイル>
# ログは logs/codex/ に残る（社内報の一次資料）。
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <issue番号> <worktreeの絶対パス> <指示ファイル>" >&2
  exit 2
fi

ISSUE="$1"
WT="$2"
PROMPT_FILE="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs/codex"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/issue-${ISSUE}-$(date +%Y%m%d-%H%M%S).log"

[ -d "$WT" ] || { echo "worktree が見つかりません: $WT" >&2; exit 2; }
[ -f "$PROMPT_FILE" ] || { echo "指示ファイルが見つかりません: $PROMPT_FILE" >&2; exit 2; }

echo "LOG: $LOG"
set +e
codex exec \
  --cd "$WT" \
  --sandbox workspace-write \
  --add-dir "$ROOT/.git" \
  -c sandbox_workspace_write.network_access=true \
  "$(cat "$PROMPT_FILE")" < /dev/null > "$LOG" 2>&1
STATUS=$?
set -e

echo "EXIT: $STATUS"
echo "----- 最終出力（ログ末尾 60 行） -----"
tail -n 60 "$LOG"
exit "$STATUS"
