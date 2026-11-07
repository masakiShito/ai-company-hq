#!/usr/bin/env bash
# エンジニア（Codex）に仕事を依頼する唯一の窓口。
# usage: scripts/codex-run.sh <issue番号> <worktreeの絶対パス> <指示ファイル>
# ログは logs/codex/ に残る（社内報の一次資料）。
#
# 見張り番：Codex が固まったら自動で打ち切る（exit 124）
#   CODEX_IDLE_TIMEOUT_SEC  ログが更新されないまま待つ上限（既定 900 秒＝15分）
#   CODEX_TOTAL_TIMEOUT_SEC 全体の上限（既定 3000 秒＝50分）
set -uo pipefail

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
IDLE_LIMIT="${CODEX_IDLE_TIMEOUT_SEC:-900}"
TOTAL_LIMIT="${CODEX_TOTAL_TIMEOUT_SEC:-3000}"

[ -d "$WT" ] || { echo "worktree が見つかりません: $WT" >&2; exit 2; }
[ -f "$PROMPT_FILE" ] || { echo "指示ファイルが見つかりません: $PROMPT_FILE" >&2; exit 2; }

echo "LOG: $LOG"

# Codex を独立したプロセスグループで起動し、子プロセスごと止められるようにする
set -m
codex exec \
  --cd "$WT" \
  --sandbox workspace-write \
  --add-dir "$ROOT/.git" \
  -c sandbox_workspace_write.network_access=true \
  "$(cat "$PROMPT_FILE")" < /dev/null > "$LOG" 2>&1 &
PID=$!
set +m

START=$(date +%s)
LAST_CHANGE=$START
LAST_SIZE=0
REASON=""

while kill -0 "$PID" 2>/dev/null; do
  sleep 15
  NOW=$(date +%s)
  SIZE=$(wc -c < "$LOG" | tr -d ' ')
  if [ "$SIZE" != "$LAST_SIZE" ]; then
    LAST_SIZE=$SIZE
    LAST_CHANGE=$NOW
  fi
  if [ $((NOW - LAST_CHANGE)) -ge "$IDLE_LIMIT" ]; then
    REASON="ログが $((IDLE_LIMIT / 60)) 分間更新されなかった"
    break
  fi
  if [ $((NOW - START)) -ge "$TOTAL_LIMIT" ]; then
    REASON="全体の上限 $((TOTAL_LIMIT / 60)) 分に達した"
    break
  fi
done

if [ -n "$REASON" ]; then
  kill -TERM -- "-$PID" 2>/dev/null
  sleep 5
  kill -KILL -- "-$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  echo "EXIT: 124"
  echo "TIMEOUT: $REASON ため、Codex を打ち切った"
  echo "----- ログ末尾 40 行 -----"
  tail -n 40 "$LOG"
  exit 124
fi

wait "$PID"
STATUS=$?
echo "EXIT: $STATUS"
echo "----- 最終出力（ログ末尾 60 行） -----"
tail -n 60 "$LOG"
exit "$STATUS"
